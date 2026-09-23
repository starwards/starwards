import {
    CycleRepairPriorityArg,
    RepairPriority,
    RepairProtocolMode,
    RepairProtocolSlot,
    SavedPowerEntry,
    ToggleRepairProtocolModeArg,
    isCycleRepairPriorityArg,
    isToggleRepairProtocolModeArg,
} from './repair-queue';
import { IterationData, Updateable } from '../updateable';
import { PowerLevel, SystemState } from './system';
import {
    REPAIR_TIER_ORDER,
    RepairProtocolStats,
    getEffectiveRepairTier,
    getModeStats,
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
 * How much faster a CANCELLING wind-down unwinds progress than a RUNNING slot builds it (issue
 * #2255, R2) — cancelling at progress `p` now costs `p / CANCEL_WINDDOWN_SPEED_MULTIPLIER`
 * instead of `p`, moving the break-even point (where backing out no longer saves time versus just
 * finishing) from 50% to `1 - 1/CANCEL_WINDDOWN_SPEED_MULTIPLIER` = 2/3 progress.
 */
export const CANCEL_WINDDOWN_SPEED_MULTIPLIER = 2;

/**
 * Reverts `slot`'s declared side effects and, when `refundEnergyCell` is true, refunds one spent
 * `Reactor.energyCells` (capped at `design.maxEnergyCells`). Called both by `RepairManager`
 * (completion, cancellation wind-down, force-stop) and by `resetShipState` (a slot left
 * RUNNING/CANCELLING across an NPC<->PC conversion has no manager left to revert it otherwise —
 * see `SavedPowerEntry`).
 *
 * The energy-cell rule (issue #2247 review): a cell stays spent only on a successful completion —
 * every other exit from RUNNING/CANCELLING refunds it, same as chain-gun ammo returning an
 * unloaded round to the magazine. Callers pass `refundEnergyCell` rather than this function
 * inferring it, since only the caller (which already has the protocol, or — for `resetShipState` —
 * looks it up in the real catalog) knows whether the slot's protocol `consumesEnergyCell` at all.
 *
 * Only restores a saved `power` value if nothing else changed it since the side effect forced it —
 * a player who commanded power on the affected system mid-run (or a GM, or a second protocol) has
 * their intent honored; a stale snapshot never overwrites it.
 *
 * Known limitation (R7, PR #2030 review round 2): a player who *deliberately* powers the system
 * down mid-run is indistinguishable from the side effect itself (both read as
 * `PowerLevel.SHUTDOWN`), so that specific case still gets silently reverted. Accepted as-is.
 */
export function revertRepairSlot(state: ShipState, slot: RepairProtocolSlot, refundEnergyCell: boolean) {
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
        state.reactor.energyCells = Math.min(state.reactor.design.maxEnergyCells, state.reactor.energyCells + 1);
    }
}

/**
 * Deliberately narrower than `EnergySource`/`HeatSink` in `ship-manager-abstract.ts` (which
 * `RepairManager` structurally satisfies via `internalProxy`) — importing those types here would
 * pull `ship-manager-abstract.ts` (and its `import ... from '..'` barrel self-reference) into the
 * module graph earlier than `ship/index.ts` finishes loading it, breaking the circular re-export.
 */
export interface RepairEnergySource {
    drawEnergy(value: number): number;
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
        this.drainToggleModeCommands();
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

    private drainToggleModeCommands() {
        const commands: unknown[] = this.state.repairQueue.toggleModeCommands;
        this.state.repairQueue.toggleModeCommands = [];
        for (const command of commands) {
            if (!isToggleRepairProtocolModeArg(command)) {
                continue;
            }
            this.handleToggleMode(command);
        }
    }

    /**
     * Flips a slot's mode between Responsive and Dark (issue #2255) — a no-op for an unknown
     * protocol, a docked/shipyard-tier protocol (single-mode: nothing to toggle), or a slot that is
     * RUNNING/CANCELLING (mode is locked for the run it already started at, same spirit as
     * `handleCycle` ignoring a key pressed while CANCELLING).
     */
    private handleToggleMode({ protocolId }: ToggleRepairProtocolModeArg) {
        const slot = this.getSlot(protocolId);
        if (!slot || slot.priority === RepairPriority.RUNNING || slot.priority === RepairPriority.CANCELLING) {
            return;
        }
        const protocol = this.getProtocol(protocolId);
        if (!protocol || protocol.tier !== 'field') {
            return;
        }
        slot.mode =
            slot.mode === RepairProtocolMode.Responsive ? RepairProtocolMode.Dark : RepairProtocolMode.Responsive;
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
                    this.forceOff(
                        slot,
                        protocol,
                        `${protocol.name} was cancelled: ship no longer has the required repair tier`,
                    );
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
            this.forceOff(slot, undefined, 'unknown repair protocol');
            return;
        }
        if (slot.priority === RepairPriority.CANCELLING) {
            this.tickCancelling(slot, protocol, deltaSeconds);
            return;
        }
        const modeStats = getModeStats(protocol, slot.mode);
        // A zero-draw protocol (e.g. reactorJumpStart, armorPlateRenewal) is runnable from true
        // zero energy: it never draws. An operation is all-or-nothing, so any shortfall -- even a
        // proportional brownout that grants most of the draw -- is a starved tick.
        if (modeStats.energyDraw > 0 && this.energySource.drawEnergy(modeStats.energyDraw * deltaSeconds) < 1) {
            // brief dip: no progress/heat this tick, but the run survives until the shortfall is
            // sustained past the grace window (R3) — then it's still all-or-nothing
            slot.starvedSeconds += deltaSeconds;
            slot.energyStarved = true;
            if (slot.starvedSeconds >= ENERGY_STARVATION_GRACE_SECONDS) {
                this.forceOff(slot, protocol, `${protocol.name} was cancelled: insufficient reactor energy`);
            }
            return;
        }
        slot.starvedSeconds = 0;
        slot.energyStarved = false;
        const duration = this.getDuration(protocol, slot.mode);
        this.applyHeat(protocol, modeStats, duration, deltaSeconds);
        slot.progress = Math.min(1, slot.progress + deltaSeconds / duration);
        if (slot.progress >= 1) {
            this.complete(slot, protocol);
        }
    }

    /**
     * Progress runs back toward 0% instead of stopping instantly (issue #2247: "cancel = wind-down,
     * like missile unload"), now at `CANCEL_WINDDOWN_SPEED_MULTIPLIER`x forward speed (issue #2255,
     * R2) — cancelling at progress `p` costs `p / CANCEL_WINDDOWN_SPEED_MULTIPLIER` of the
     * duration instead of `p`.
     */
    private tickCancelling(slot: RepairProtocolSlot, protocol: RepairProtocolStats, deltaSeconds: number) {
        const duration = this.getDuration(protocol, slot.mode);
        slot.progress = Math.max(0, slot.progress - (deltaSeconds * CANCEL_WINDDOWN_SPEED_MULTIPLIER) / duration);
        if (slot.progress <= 0) {
            this.revertSideEffects(slot, !!protocol.consumesEnergyCell);
            slot.priority = RepairPriority.OFF;
            slot.progress = 0;
        }
    }

    /** `dynamicDuration`, when declared, always wins over the mode's `duration` — see its doc comment. */
    private getDuration(protocol: RepairProtocolStats, mode: RepairProtocolMode): number {
        return protocol.dynamicDuration ? protocol.dynamicDuration(this.state) : getModeStats(protocol, mode).duration;
    }

    /** A cell stays spent only on a successful completion — this is the one exit from RUNNING that never refunds it. */
    private complete(slot: RepairProtocolSlot, protocol: RepairProtocolStats) {
        this.revertSideEffects(slot, false);
        this.resetTargets(protocol);
        protocol.onComplete?.(this.state);
        slot.priority = RepairPriority.OFF;
        slot.progress = 0;
    }

    /**
     * All-or-nothing force-stop (sustained energy starvation, tier lost mid-run): reverts side
     * effects and — like every other non-completion exit from RUNNING — refunds a spent energy
     * cell. `protocol` is `undefined` only for the defensive "catalog changed out from under a
     * RUNNING slot" case, which never refunds since it can't know whether one was ever spent.
     */
    private forceOff(slot: RepairProtocolSlot, protocol: RepairProtocolStats | undefined, reason: string) {
        this.revertSideEffects(slot, !!protocol?.consumesEnergyCell);
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
     * The active mode's `heat` is a fixed total budget added over `duration`, split evenly across
     * the distinct target *system keys*, and, when a key resolves to more than one live instance,
     * split evenly again across those instances so the total delivered stays that budget
     * regardless of how many instances the ship happens to have.
     */
    private applyHeat(
        protocol: RepairProtocolStats,
        modeStats: { heat: number },
        duration: number,
        deltaSeconds: number,
    ) {
        if (modeStats.heat <= 0) {
            return;
        }
        const uniqueKeys = [...new Set(protocol.targets.map((t) => t.system))];
        if (uniqueKeys.length === 0) {
            return;
        }
        const perKeyHeatPerSecond = modeStats.heat / duration / uniqueKeys.length;
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
        for (const key of getModeStats(protocol, slot.mode).sideEffectSystems) {
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

    private revertSideEffects(slot: RepairProtocolSlot, refundEnergyCell: boolean) {
        revertRepairSlot(this.state, slot, refundEnergyCell);
    }
}
