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
 * protocol before it's treated as a *sustained* shortfall and aborted. Chosen to comfortably
 * outlast a single weapon-fire tick's energy draw while still enforcing "sustained" — not
 * validated against real playtest numbers, same caveat as the rest of the catalog.
 */
export const ENERGY_STARVATION_GRACE_SECONDS = 2;

/**
 * Reverts `slot`'s declared side effects and, unless `refundEnergyCell` is false, refunds the
 * energy cell it spent at start (if its protocol `consumesEnergyCell`). Called both by
 * `RepairManager` — a self-abort or a `CANCELLING` wind-down reaching 0% both refund, a normal
 * completion (`refundEnergyCell: false`) keeps the cell spent — and by `resetShipState` (a slot
 * left `RUNNING`/`CANCELLING` across an NPC<->PC conversion has no manager left to revert it
 * otherwise, see `SavedPowerEntry`).
 *
 * Only restores a saved `power` value if nothing else changed it since the side effect forced it —
 * a player who commanded power on the affected system mid-run (or a GM, or a second protocol) has
 * their intent honored; a stale snapshot never overwrites it.
 *
 * Known limitation (carried over from the pre-#2247 repair-queue design): a player who
 * *deliberately* powers the system down mid-run is indistinguishable from the side effect itself
 * (both read as `PowerLevel.SHUTDOWN`), so that specific case still gets silently reverted.
 * Distinguishing it would need an ownership flag on every `@gameField` write this side effect could
 * collide with — infrastructure this codebase has nowhere else and that's disproportionate to the
 * edge case. Accepted as-is.
 */
export function revertRepairSlot(
    state: ShipState,
    slot: RepairProtocolSlot,
    catalog: Record<string, RepairProtocolStats> = repairProtocols,
    refundEnergyCell = true,
): void {
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
    if (refundEnergyCell) {
        const protocol = Object.prototype.hasOwnProperty.call(catalog, slot.protocolId)
            ? catalog[slot.protocolId]
            : undefined;
        if (protocol?.consumesEnergyCell) {
            state.reactor.energyCells = Math.min(state.reactor.design.maxEnergyCells, state.reactor.energyCells + 1);
        }
    }
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

/** Scheduling tie-break within a priority tier is catalog order, i.e. `this.slots`' own order. */
const PENDING_PRIORITIES_HIGH_TO_LOW = [RepairPriority.HIGH, RepairPriority.MEDIUM, RepairPriority.LOW] as const;

/**
 * Server-authoritative repair-priority scheduler (issue #2247): one `RepairProtocolSlot` per
 * catalog protocol, each independently `OFF`/`LOW`/`MEDIUM`/`HIGH`/`RUNNING`/`CANCELLING`. At most
 * one slot is ever `RUNNING` (or winding down, `CANCELLING`) at a time; whenever neither is present,
 * the highest-priority pending slot is promoted, ties broken by catalog order. No pre-emption:
 * raising a slot to `HIGH` never interrupts whatever is already `RUNNING`. Sibling to
 * `damage-manager.ts` / `heat-manager.ts`. A protocol can't be queued more than once, so there is
 * no ordered list to reorder and no queue-length cap needed.
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
        this.cancelIfUnavailable();
        this.ensureRunning();
        this.tickRunning(deltaSeconds);
        this.tickCancelling(deltaSeconds);
    }

    private get slots() {
        return this.state.repairQueue.slots;
    }

    /** One slot per `this.catalog` entry, in catalog order — created once, on construction. */
    private ensureSlots() {
        const existingIds = new Set(this.slots.map((s) => s.protocolId));
        for (const protocolId of Object.keys(this.catalog)) {
            if (!existingIds.has(protocolId)) {
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

    private getRunning(): RepairProtocolSlot | undefined {
        return this.slots.find((s) => s.priority === RepairPriority.RUNNING);
    }

    private getCancelling(): RepairProtocolSlot | undefined {
        return this.slots.find((s) => s.priority === RepairPriority.CANCELLING);
    }

    /** `dynamicDuration`, when declared, always wins over the static `duration` — see its doc comment. */
    private getDuration(protocol: RepairProtocolStats): number {
        return protocol.dynamicDuration ? protocol.dynamicDuration(this.state) : protocol.duration;
    }

    /**
     * Why `protocol` can't be set pending right now, or `undefined` if it can — same underlying
     * check as `isProtocolAvailable` (single source of truth for the boolean), refined into a
     * specific message only once that check has already failed.
     */
    private unavailabilityReason(protocol: RepairProtocolStats): string | undefined {
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

    private drainCycleCommands() {
        const commands: unknown[] = this.state.repairQueue.cyclePriorityCommands;
        this.state.repairQueue.cyclePriorityCommands = [];
        for (const command of commands) {
            if (!isCycleRepairPriorityArg(command)) {
                continue;
            }
            const { protocolId, direction }: CycleRepairPriorityArg = command;
            const slot = this.slots.find((s) => s.protocolId === protocolId);
            if (slot) {
                this.applyCycle(slot, direction);
            }
        }
    }

    /**
     * `OFF -> LOW -> MEDIUM -> HIGH` ('up', clamped at `HIGH`) / the reverse ('down', clamped at
     * `OFF`). Either key on a `RUNNING` slot starts the wind-down (`CANCELLING`); either key on an
     * already-`CANCELLING` slot is ignored — the wind-down always completes to `OFF` (issue #2247's
     * open decision, option (a): no mid-wind-down resume).
     */
    private applyCycle(slot: RepairProtocolSlot, direction: 'up' | 'down') {
        if (slot.priority === RepairPriority.RUNNING) {
            slot.priority = RepairPriority.CANCELLING;
            slot.refusalReason = '';
            return;
        }
        if (slot.priority === RepairPriority.CANCELLING) {
            return;
        }
        if (direction === 'up') {
            this.raise(slot);
        } else {
            this.lower(slot);
        }
    }

    private raise(slot: RepairProtocolSlot) {
        switch (slot.priority) {
            case RepairPriority.OFF: {
                const protocol = this.getProtocol(slot.protocolId);
                const reason = protocol ? this.unavailabilityReason(protocol) : 'unknown repair protocol';
                if (reason) {
                    slot.refusalReason = reason;
                    return;
                }
                slot.refusalReason = '';
                slot.priority = RepairPriority.LOW;
                return;
            }
            case RepairPriority.LOW:
                slot.refusalReason = '';
                slot.priority = RepairPriority.MEDIUM;
                return;
            case RepairPriority.MEDIUM:
                slot.refusalReason = '';
                slot.priority = RepairPriority.HIGH;
                return;
            default:
                return; // HIGH: clamped
        }
    }

    private lower(slot: RepairProtocolSlot) {
        switch (slot.priority) {
            case RepairPriority.HIGH:
                slot.refusalReason = '';
                slot.priority = RepairPriority.MEDIUM;
                return;
            case RepairPriority.MEDIUM:
                slot.refusalReason = '';
                slot.priority = RepairPriority.LOW;
                return;
            case RepairPriority.LOW:
                slot.refusalReason = '';
                slot.priority = RepairPriority.OFF;
                return;
            default:
                return; // OFF: clamped
        }
    }

    /**
     * A pending slot that loses availability (e.g. undocking drops a docked-tier protocol below
     * the ship's effective tier) drops straight to `OFF` — it never ran, so there's nothing to
     * revert. A `RUNNING` slot that loses its tier is aborted the same way an energy-starved one is
     * — side effects reverted, energy cell refunded, straight to `OFF`, never a `CANCELLING`
     * wind-down (that path is reserved for a deliberate player cancel).
     */
    private cancelIfUnavailable() {
        for (const slot of this.slots) {
            const protocol = this.getProtocol(slot.protocolId);
            if (!protocol) {
                continue;
            }
            if (
                slot.priority === RepairPriority.LOW ||
                slot.priority === RepairPriority.MEDIUM ||
                slot.priority === RepairPriority.HIGH
            ) {
                const reason = this.unavailabilityReason(protocol);
                if (reason) {
                    slot.priority = RepairPriority.OFF;
                    slot.refusalReason = reason;
                }
            } else if (slot.priority === RepairPriority.RUNNING) {
                if (REPAIR_TIER_ORDER[protocol.tier] > REPAIR_TIER_ORDER[getEffectiveRepairTier(this.state)]) {
                    this.abortToOff(
                        slot,
                        `${protocol.name} was cancelled: ship no longer has the required repair tier`,
                    );
                }
            }
        }
    }

    private ensureRunning() {
        if (this.getRunning() || this.getCancelling()) {
            return;
        }
        for (const priority of PENDING_PRIORITIES_HIGH_TO_LOW) {
            const slot = this.slots.find((s) => s.priority === priority);
            if (slot) {
                this.startRunning(slot);
                return;
            }
        }
    }

    private startRunning(slot: RepairProtocolSlot) {
        const protocol = this.getProtocol(slot.protocolId);
        if (!protocol) {
            slot.priority = RepairPriority.OFF;
            return;
        }
        slot.priority = RepairPriority.RUNNING;
        slot.progress = 0;
        slot.refusalReason = '';
        this.applySideEffects(slot, protocol);
        // Spent at start, not on completion — same philosophy as chain-gun ammo, which leaves the
        // magazine at load start (`chain-gun-manager.ts` load branch). Refunded by `revertRepairSlot`
        // if this run never completes (self-abort or wind-down) — see `abortToOff`.
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
            this.abortToOff(slot, '');
            return;
        }
        // A zero-draw protocol (e.g. reactorJumpStart, armorPlateRenewal) must be runnable from
        // true zero energy — but EnergyManager.trySpendEnergy checks `energy > value` (strictly
        // greater), so spending even nothing out of an exactly-empty reactor reads as a refusal.
        // Skip the spend attempt entirely rather than let that edge case starve a free protocol.
        if (protocol.energyDraw > 0 && !this.energySource.trySpendEnergy(protocol.energyDraw * deltaSeconds)) {
            // brief dip: no progress/heat this tick, but the run survives until the shortfall is
            // sustained past the grace window — then it's still all-or-nothing
            slot.starvedSeconds += deltaSeconds;
            slot.energyStarved = true;
            if (slot.starvedSeconds >= ENERGY_STARVATION_GRACE_SECONDS) {
                this.abortToOff(slot, `${protocol.name} was cancelled: insufficient reactor energy`);
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

    /**
     * Wind-down: progress runs back toward 0 at the same rate it would run forward (like a missile
     * unload). No energy draw, no heat and no starvation tracking while winding down — the protocol
     * isn't doing work, it's undoing it. At 0%, `abortToOff` reverts side effects, refunds the
     * energy cell, and only then can the next pending protocol start.
     */
    private tickCancelling(deltaSeconds: number) {
        const slot = this.getCancelling();
        if (!slot) {
            return;
        }
        const protocol = this.getProtocol(slot.protocolId);
        if (!protocol) {
            this.abortToOff(slot, '');
            return;
        }
        slot.progress = Math.max(0, slot.progress - deltaSeconds / this.getDuration(protocol));
        if (slot.progress <= 0) {
            this.abortToOff(slot, '');
        }
    }

    private complete(slot: RepairProtocolSlot, protocol: RepairProtocolStats) {
        // side effects revert on completion too — the declared power-down was only ever for the
        // run's duration, not a permanent effect. The energy cell (if any) stays spent: it was
        // already committed at start and this run did complete.
        revertRepairSlot(this.state, slot, this.catalog, false);
        this.resetTargets(protocol);
        protocol.onComplete?.(this.state);
        slot.priority = RepairPriority.OFF;
        slot.progress = 0;
        slot.refusalReason = '';
        slot.starvedSeconds = 0;
        slot.energyStarved = false;
    }

    /** Self-abort (starvation, tier lost) or a wind-down reaching 0% — never a completion. */
    private abortToOff(slot: RepairProtocolSlot, reason: string) {
        revertRepairSlot(this.state, slot, this.catalog);
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
}
