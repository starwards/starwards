import {
    CycleRepairPriorityArg,
    RepairPriority,
    RepairProtocolSlot,
    SavedPowerEntry,
    isCycleRepairPriorityArg,
} from './repair-queue';
import { IterationData, Updateable } from '../updateable';
import { PowerLevel, SystemState } from './system';
import {
    REPAIR_TIER_ORDER,
    RepairProtocolStats,
    getEffectiveRepairTier,
    getRepairableSystemInstances,
    isProtocolAvailable,
    isRepairableSystemKey,
    repairProtocols,
} from '../configurations/repair-protocols';
import { ShipState } from './ship-state';
import { getSystems } from './system';

/**
 * How long a brief energy dip (a chain-gun burst, another consumer's spike) may starve a running
 * protocol before it's treated as a *sustained* shortfall and force-stopped (R3, PR #2030 review
 * round 2). Chosen to comfortably outlast a single weapon-fire tick's energy draw while still
 * enforcing "sustained" — not validated against real playtest numbers.
 */
export const ENERGY_STARVATION_GRACE_SECONDS = 2;

/**
 * Reverts `slot`'s declared side effects and clears the saved list. Called both by `RepairManager`
 * (completion, cancellation wind-down, force-stop) and by `resetShipState` (a slot left RUNNING
 * across an NPC<->PC conversion has no manager left to revert it otherwise — see `SavedPowerEntry`).
 *
 * Only restores a saved `power` value if nothing else changed it since the side effect forced it —
 * a player who commanded power on the affected system mid-run (or a GM, or a second protocol) has
 * their intent honored; a stale snapshot never overwrites it.
 *
 * Known limitation (R7, PR #2030 review round 2): a player who *deliberately* powers the system
 * down mid-run is indistinguishable from the side effect itself (both read as
 * `PowerLevel.SHUTDOWN`), so that specific case still gets silently reverted. Accepted as-is.
 */
export function revertSlotSideEffects(state: ShipState, slot: RepairProtocolSlot) {
    for (const entry of slot.savedPower) {
        if (!isRepairableSystemKey(entry.system)) {
            continue; // defensive: the schema field is a plain string, not the union it represents
        }
        const instance = getRepairableSystemInstances(state, entry.system)[entry.index];
        if (instance && instance.power === PowerLevel.SHUTDOWN) {
            instance.power = entry.value;
        }
    }
    slot.savedPower.splice(0);
}

/**
 * Deliberately narrower than `EnergySource`/`HeatSink` in `ship-manager-abstract.ts` (which
 * `RepairManager` structurally satisfies via `internalProxy`) — importing those types here would
 * pull `ship-manager-abstract.ts` (and its `import ... from '..'` barrel self-reference) into the
 * module graph earlier than `ship/index.ts` finishes loading it, breaking the circular re-export.
 */
export interface RepairEnergySource {
    trySpendEnergy(value: number): boolean;
}
export interface RepairHeatSink {
    addHeat(value: number, system: SystemState): void;
}

/**
 * Server-authoritative repair execution engine (issue #2247): one `RepairProtocolSlot` per catalog
 * protocol holds its own priority, with at most one slot RUNNING/CANCELLING at a time. Sibling to
 * `damage-manager.ts` / `heat-manager.ts`.
 */
export class RepairManager implements Updateable {
    constructor(
        private state: ShipState,
        private energySource: RepairEnergySource,
        private heatSink: RepairHeatSink,
        private catalog: Record<string, RepairProtocolStats> = repairProtocols,
    ) {
        this.ensureSlots();
    }

    update({ deltaSeconds }: IterationData) {
        this.drainCycleCommands();
        this.checkAvailabilityLoss();
        this.ensureRunning();
        this.tickRunning(deltaSeconds);
    }

    private get slots() {
        return this.state.repairQueue.slots;
    }

    /** Creates a slot for every catalog protocol not already represented — idempotent, so a fresh manager over an already-populated (e.g. cloned) state adds nothing. */
    private ensureSlots() {
        const existing = new Set(this.slots.map((s) => s.protocolId));
        for (const protocolId of Object.keys(this.catalog)) {
            if (!existing.has(protocolId)) {
                const slot = new RepairProtocolSlot();
                slot.protocolId = protocolId;
                this.slots.push(slot);
            }
        }
    }

    /**
     * Catalog lookup safe against a client-supplied `protocolId` that collides with an inherited
     * `Object.prototype` member (`"constructor"`, `"toString"`, `"valueOf"`, `"__proto__"`, ...) —
     * those resolve to a truthy, catalog-shaped-enough value via plain `this.catalog[id]` and would
     * otherwise sail past every guard below and throw deep inside the next tick.
     */
    private getProtocol(protocolId: string): RepairProtocolStats | undefined {
        return Object.prototype.hasOwnProperty.call(this.catalog, protocolId) ? this.catalog[protocolId] : undefined;
    }

    private getSlot(protocolId: string): RepairProtocolSlot | undefined {
        return this.slots.find((s) => s.protocolId === protocolId);
    }

    private getRunning(): RepairProtocolSlot | undefined {
        return this.slots.find(
            (s) => s.priority === RepairPriority.RUNNING || s.priority === RepairPriority.CANCELLING,
        );
    }

    private isPending(slot: RepairProtocolSlot): boolean {
        return (
            slot.priority === RepairPriority.LOW ||
            slot.priority === RepairPriority.MEDIUM ||
            slot.priority === RepairPriority.HIGH
        );
    }

    private drainCycleCommands() {
        const commands: unknown[] = this.state.repairQueue.cyclePriorityCommands;
        this.state.repairQueue.cyclePriorityCommands = [];
        for (const command of commands) {
            if (!isCycleRepairPriorityArg(command)) {
                continue;
            }
            this.handleCycle(command);
        }
    }

    /**
     * `alt+<n>` raises (`OFF -> LOW -> MEDIUM -> HIGH`, clamps at `HIGH`), `alt+shift+<n>` lowers
     * (`HIGH -> MEDIUM -> LOW -> OFF`, clamps at `OFF`). Either key on a RUNNING slot starts the
     * wind-down (`CANCELLING`); either key on an already-CANCELLING slot is ignored — the wind-down
     * always completes to `OFF` (issue #2247's open decision, option a).
     */
    private handleCycle({ protocolId, direction }: CycleRepairPriorityArg) {
        const slot = this.getSlot(protocolId);
        if (!slot) {
            return; // unknown protocol id: defensive no-op, same spirit as getProtocol's guard
        }
        slot.refusalReason = '';

        if (slot.priority === RepairPriority.RUNNING) {
            slot.priority = RepairPriority.CANCELLING;
            return;
        }
        if (slot.priority === RepairPriority.CANCELLING) {
            return;
        }

        if (direction === 'up') {
            if (slot.priority === RepairPriority.HIGH) {
                return;
            }
            if (slot.priority === RepairPriority.OFF) {
                const protocol = this.getProtocol(protocolId);
                const refusal = protocol ? this.availabilityRefusal(protocol) : 'unknown repair protocol';
                if (refusal) {
                    slot.refusalReason = refusal;
                    return;
                }
            }
            slot.priority = slot.priority + 1;
        } else {
            if (slot.priority === RepairPriority.OFF) {
                return;
            }
            slot.priority = slot.priority - 1;
        }
    }

    /** Why `protocol` cannot run right now, or `undefined` if it can — see `isProtocolAvailable`. */
    private availabilityRefusal(protocol: RepairProtocolStats): string | undefined {
        if (isProtocolAvailable(this.state, protocol)) {
            return undefined;
        }
        if (REPAIR_TIER_ORDER[protocol.tier] > REPAIR_TIER_ORDER[getEffectiveRepairTier(this.state)]) {
            return `${protocol.name} requires a higher repair tier than this ship has`;
        }
        if (protocol.consumesEnergyCell && this.state.reactor.energyCells <= 0) {
            return `${protocol.name} needs an energy cell but none are available`;
        }
        return `${protocol.name} needs equipment this ship doesn't have`;
    }

    /**
     * A pending slot that becomes unavailable (e.g. undock) drops to `OFF` with a reason. A RUNNING
     * slot that loses its repair tier (e.g. undocking mid-run) is force-stopped outright — same
     * all-or-nothing rule as a sustained energy shortfall — rather than left stalled or allowed to
     * keep running off-tier. Deliberately checks only tier here (not full availability): a
     * `consumesEnergyCell` protocol's own cell is already spent the instant it starts, so a blanket
     * availability recheck would force-stop it on its very first tick.
     */
    private checkAvailabilityLoss() {
        for (const slot of this.slots) {
            const protocol = this.getProtocol(slot.protocolId);
            if (!protocol) {
                continue;
            }
            if (this.isPending(slot)) {
                const refusal = this.availabilityRefusal(protocol);
                if (refusal) {
                    slot.priority = RepairPriority.OFF;
                    slot.refusalReason = refusal;
                }
            } else if (slot.priority === RepairPriority.RUNNING) {
                if (REPAIR_TIER_ORDER[protocol.tier] > REPAIR_TIER_ORDER[getEffectiveRepairTier(this.state)]) {
                    this.forceOff(slot, `${protocol.name} was cancelled: ship no longer has the required repair tier`);
                }
            }
        }
    }

    /**
     * Promotes the highest-priority pending slot to RUNNING once nothing else is RUNNING/CANCELLING
     * — no pre-emption, so raising a slot to HIGH never interrupts one already running. Ties go to
     * catalog order (`Array.prototype.sort` is stable, and `this.slots` is already catalog-order).
     * A candidate that turns out unavailable right at promotion time (e.g. the last energy cell was
     * spent by a protocol that just finished) drops to OFF with a reason and the next candidate is
     * tried instead, rather than blocking the whole schedule.
     */
    private ensureRunning() {
        if (this.getRunning()) {
            return;
        }
        const pending = this.slots.filter((s) => this.isPending(s)).sort((a, b) => b.priority - a.priority);
        for (const slot of pending) {
            const protocol = this.getProtocol(slot.protocolId);
            if (!protocol) {
                slot.priority = RepairPriority.OFF;
                continue;
            }
            const refusal = this.availabilityRefusal(protocol);
            if (refusal) {
                slot.priority = RepairPriority.OFF;
                slot.refusalReason = refusal;
                continue;
            }
            this.start(slot, protocol);
            return;
        }
    }

    /** Spends the energy cell (if any) up front — same philosophy as chain-gun ammo, which leaves the magazine at load start. */
    private start(slot: RepairProtocolSlot, protocol: RepairProtocolStats) {
        slot.priority = RepairPriority.RUNNING;
        slot.progress = 0;
        slot.starvedSeconds = 0;
        slot.energyStarved = false;
        this.applySideEffects(slot, protocol);
        if (protocol.consumesEnergyCell) {
            this.state.reactor.energyCells = Math.max(0, this.state.reactor.energyCells - 1);
        }
    }

    private tickRunning(deltaSeconds: number) {
        const slot = this.getRunning();
        if (!slot) {
            return;
        }
        const protocol = this.getProtocol(slot.protocolId);
        if (!protocol) {
            this.forceOff(slot, 'unknown repair protocol');
            return;
        }
        if (slot.priority === RepairPriority.CANCELLING) {
            this.tickCancelling(slot, protocol, deltaSeconds);
            return;
        }
        // A zero-draw protocol (e.g. reactorJumpStart, armorPlateRenewal) must be runnable from
        // true zero energy — but EnergyManager.trySpendEnergy checks `energy > value` (strictly
        // greater), so spending even nothing out of an exactly-empty reactor reads as a refusal.
        // Skip the spend attempt entirely rather than let that edge case starve a free protocol.
        if (protocol.energyDraw > 0 && !this.energySource.trySpendEnergy(protocol.energyDraw * deltaSeconds)) {
            // brief dip: no progress/heat this tick, but the run survives until the shortfall is
            // sustained past the grace window (R3) — then it's still all-or-nothing
            slot.starvedSeconds += deltaSeconds;
            slot.energyStarved = true;
            if (slot.starvedSeconds >= ENERGY_STARVATION_GRACE_SECONDS) {
                this.forceOff(slot, `${protocol.name} was cancelled: insufficient reactor energy`);
            }
            return;
        }
        slot.starvedSeconds = 0;
        slot.energyStarved = false;
        this.applyHeat(protocol, deltaSeconds);
        slot.progress = Math.min(1, slot.progress + deltaSeconds / this.getDuration(protocol));
        if (slot.progress >= 1) {
            this.complete(slot, protocol);
        }
    }

    /** Progress runs back toward 0% instead of stopping instantly (issue #2247: "cancel = wind-down, like missile unload"). */
    private tickCancelling(slot: RepairProtocolSlot, protocol: RepairProtocolStats, deltaSeconds: number) {
        slot.progress = Math.max(0, slot.progress - deltaSeconds / this.getDuration(protocol));
        if (slot.progress <= 0) {
            this.revertSideEffects(slot);
            if (protocol.consumesEnergyCell) {
                this.state.reactor.energyCells = Math.min(
                    this.state.reactor.design.maxEnergyCells,
                    this.state.reactor.energyCells + 1,
                );
            }
            slot.priority = RepairPriority.OFF;
            slot.progress = 0;
        }
    }

    /** `dynamicDuration`, when declared, always wins over the static `duration` — see its doc comment. */
    private getDuration(protocol: RepairProtocolStats): number {
        return protocol.dynamicDuration ? protocol.dynamicDuration(this.state) : protocol.duration;
    }

    private complete(slot: RepairProtocolSlot, protocol: RepairProtocolStats) {
        this.revertSideEffects(slot);
        this.resetTargets(protocol);
        protocol.onComplete?.(this.state);
        slot.priority = RepairPriority.OFF;
        slot.progress = 0;
    }

    /** All-or-nothing force-stop: reverts side effects but — unlike a completed wind-down — never refunds a spent energy cell. */
    private forceOff(slot: RepairProtocolSlot, reason: string) {
        this.revertSideEffects(slot);
        slot.priority = RepairPriority.OFF;
        slot.progress = 0;
        slot.starvedSeconds = 0;
        slot.energyStarved = false;
        slot.refusalReason = reason;
    }

    private resetTargets(protocol: RepairProtocolStats) {
        for (const system of getSystems(this.state)) {
            const topLevelKey = system.pointer.split('/')[1];
            for (const defectible of system.defectibles) {
                if (protocol.targets.some((t) => t.system === topLevelKey && t.field === defectible.field)) {
                    (system.state as unknown as Record<string, number>)[defectible.field] = defectible.normal;
                }
            }
        }
    }

    /**
     * `protocol.heat` is a fixed total budget added over `protocol.duration`, split evenly across
     * the distinct target *system keys*, and, when a key resolves to more than one live instance,
     * split evenly again across those instances so the total delivered stays `protocol.heat`
     * regardless of how many instances the ship happens to have.
     */
    private applyHeat(protocol: RepairProtocolStats, deltaSeconds: number) {
        if (protocol.heat <= 0) {
            return;
        }
        const uniqueKeys = [...new Set(protocol.targets.map((t) => t.system))];
        if (uniqueKeys.length === 0) {
            return;
        }
        const perKeyHeatPerSecond = protocol.heat / this.getDuration(protocol) / uniqueKeys.length;
        for (const key of uniqueKeys) {
            const instances = getRepairableSystemInstances(this.state, key);
            if (instances.length === 0) {
                continue;
            }
            const perInstanceHeatPerSecond = perKeyHeatPerSecond / instances.length;
            for (const instance of instances) {
                this.heatSink.addHeat(perInstanceHeatPerSecond * deltaSeconds, instance);
            }
        }
    }

    private applySideEffects(slot: RepairProtocolSlot, protocol: RepairProtocolStats) {
        for (const key of protocol.sideEffectSystems) {
            getRepairableSystemInstances(this.state, key).forEach((instance, index) => {
                const entry = new SavedPowerEntry();
                entry.system = key;
                entry.index = index;
                entry.value = instance.power;
                slot.savedPower.push(entry);
                instance.power = PowerLevel.SHUTDOWN;
            });
        }
    }

    private revertSideEffects(slot: RepairProtocolSlot) {
        revertSlotSideEffects(this.state, slot);
    }
}
