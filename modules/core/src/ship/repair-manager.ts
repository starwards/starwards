import {
    CancelRepairArg,
    EnqueueRepairArg,
    ReorderRepairArg,
    RepairOperation,
    RepairOperationStatus,
    SavedPowerEntry,
    isCancelRepairArg,
    isEnqueueRepairArg,
    isReorderRepairArg,
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
import { makeId } from '../id';

/**
 * Hard cap on the queue's length (SPEC-0003 doesn't specify one; without it, `repairQueue.operations`
 * — a synced `ArraySchema` broadcast to every client and rendered as one Tweakpane folder per entry —
 * grows without bound). Repair work is always explicitly player-commanded (unlike e.g. signals jobs,
 * which are auto-discovered and therefore evict low-priority entries) — so once full, new enqueue
 * commands are refused rather than silently displacing a queued operation the crew asked for.
 */
export const MAX_REPAIR_QUEUE_LENGTH = 16;

/**
 * How long a brief energy dip (a chain-gun burst, another consumer's spike) may starve an active
 * operation before it's treated as a *sustained* shortfall and aborted (R3, PR #2030 review round
 * 2). Chosen to comfortably outlast a single weapon-fire tick's energy draw while still enforcing
 * "sustained" — not validated against real playtest numbers, same caveat as the rest of the catalog.
 */
export const ENERGY_STARVATION_GRACE_SECONDS = 2;

/**
 * How long a DONE/CANCELLED operation stays visible in `RepairQueue.recentlyFinished`, and how long
 * a refused-enqueue notice stays in `RepairQueue.refusalReason`, before being cleared (R4). Both are
 * real-time durations, not tick counts — see the fields' own doc comments in `repair-queue.ts`.
 */
export const TERMINAL_DISPLAY_SECONDS = 2;

/**
 * Reverts `op`'s declared side effects and clears the saved list. Called both by `RepairManager`
 * (done/cancelled) and by `resetShipState` (an operation left active across an NPC<->PC conversion
 * has no manager left to revert it otherwise — see `SavedPowerEntry`).
 *
 * Only restores a saved `power` value if nothing else changed it since the side effect forced it —
 * a player who commanded power on the affected system mid-operation (or a GM, or a second
 * operation) has their intent honored; a stale snapshot never overwrites it.
 *
 * Known limitation (R7, PR #2030 review round 2): a player who *deliberately* powers the system
 * down mid-operation is indistinguishable from the side effect itself (both read as
 * `PowerLevel.SHUTDOWN`), so that specific case still gets silently reverted. Distinguishing it
 * would need an ownership flag on every `@gameField` write this side effect could collide with —
 * infrastructure this codebase has nowhere else and that's disproportionate to the edge case.
 * Accepted as-is.
 */
export function revertOperationSideEffects(state: ShipState, op: RepairOperation) {
    for (const entry of op.savedPower) {
        if (!isRepairableSystemKey(entry.system)) {
            continue; // defensive: the schema field is a plain string, not the union it represents
        }
        const instance = getRepairableSystemInstances(state, entry.system)[entry.index];
        if (instance && instance.power === PowerLevel.SHUTDOWN) {
            instance.power = entry.value;
        }
    }
    op.savedPower.splice(0);
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
 * Server-authoritative repair execution engine (SPEC-0003): a strictly serial
 * queue of `RepairOperation`s, one active at a time, draining commands pushed
 * onto `state.repairQueue` by `repair-commands.ts`. Sibling to
 * `damage-manager.ts` / `heat-manager.ts`.
 *
 * Invariant: whenever an operation is ACTIVE, it is always `operations[0]` — enforced by
 * `ensureActive` (only ever promotes the lowest-index QUEUED entry) and `drainReorderCommands`
 * (never moves a QUEUED entry to index 0 while one is active). DONE/CANCELLED operations never sit
 * in `operations` at all — `finish()` moves them to `recentlyFinished` immediately — so this
 * invariant never has to account for a lingering terminal entry.
 */
export class RepairManager implements Updateable {
    constructor(
        private state: ShipState,
        private energySource: RepairEnergySource,
        private heatSink: RepairHeatSink,
        private catalog: Record<string, RepairProtocolStats> = repairProtocols,
    ) {}

    update({ deltaSeconds }: IterationData) {
        this.tickRecentlyFinished(deltaSeconds);
        this.tickRefusalNotice(deltaSeconds);
        this.drainCancelCommands();
        this.drainReorderCommands();
        this.drainEnqueueCommands();
        this.cancelIfTierLost();
        this.ensureActive();
        this.tickActive(deltaSeconds);
    }

    private get operations() {
        return this.state.repairQueue.operations;
    }

    private get recentlyFinished() {
        return this.state.repairQueue.recentlyFinished;
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

    private getActive(): RepairOperation | undefined {
        return this.operations.find((o) => o.status === RepairOperationStatus.ACTIVE);
    }

    /**
     * How many of the ship's finite `Reactor.energyCells` are already spoken for by QUEUED/ACTIVE
     * operations — derived live from `this.operations` rather than tracked separately, since a cell
     * is only actually spent in `jumpStartReactor`'s `onComplete`, once an operation leaves the
     * queue for good (issue #2137).
     */
    private reservedEnergyCells(): number {
        return this.operations.filter((o) => this.getProtocol(o.protocolId)?.consumesEnergyCell).length;
    }

    /** Real-time countdown, not "one manager tick" — see `RepairOperation.terminalSecondsRemaining`. */
    private tickRecentlyFinished(deltaSeconds: number) {
        for (let i = this.recentlyFinished.length - 1; i >= 0; i--) {
            const op = this.recentlyFinished[i];
            op.terminalSecondsRemaining -= deltaSeconds;
            if (op.terminalSecondsRemaining <= 0) {
                this.recentlyFinished.splice(i, 1);
            }
        }
    }

    private tickRefusalNotice(deltaSeconds: number) {
        const queue = this.state.repairQueue;
        if (queue.refusalSecondsRemaining <= 0) {
            return;
        }
        queue.refusalSecondsRemaining -= deltaSeconds;
        if (queue.refusalSecondsRemaining <= 0) {
            queue.refusalSecondsRemaining = 0;
            queue.refusalReason = '';
        }
    }

    /** Shared by enqueue refusals and mid-repair forced cancellations — both are "why nothing happened / why it stopped" notices on the same field. */
    private notifyRefusal(reason: string) {
        this.state.repairQueue.refusalReason = reason;
        this.state.repairQueue.refusalSecondsRemaining = TERMINAL_DISPLAY_SECONDS;
    }

    private drainCancelCommands() {
        const commands: unknown[] = this.state.repairQueue.cancelCommands;
        this.state.repairQueue.cancelCommands = [];
        for (const command of commands) {
            if (!isCancelRepairArg(command)) {
                continue;
            }
            const { operationId }: CancelRepairArg = command;
            const index = this.operations.findIndex((o) => o.id === operationId);
            if (index < 0) {
                continue;
            }
            const op = this.operations[index];
            if (op.status === RepairOperationStatus.QUEUED) {
                // never started: free, immediate removal, nothing to revert
                this.operations.splice(index, 1);
            } else if (op.status === RepairOperationStatus.ACTIVE) {
                this.abort(op);
            }
        }
    }

    /**
     * Moves the QUEUED operation named by each command to its requested index — never to index 0
     * while an operation is ACTIVE there (SPEC-0003: the active operation cannot be demoted, only
     * cancelled), preserving the "ACTIVE is always operations[0]" invariant. Uses only single-index
     * replacement (`ops[i] = ops[j]`), never `splice`'s add/remove.
     *
     * This still momentarily writes over the moved operation's own array slot before its final
     * `ops[to] = op` (same category of change as `state.thrusters[i] = makeThruster(...)` during
     * ship construction) — R6 (PR #2030 review round 2) raised whether that pattern is safe under
     * Colyseus v3's refcount tracking across a client round trip. Settled, not just observed via
     * e2e: `test/repair-queue-sync.spec.ts` drives a real `Encoder`/`Decoder` pair through exactly
     * this reorder and asserts every operation's id/protocolId/progress on the decoded mirror — not
     * just its length — matches the source after the move. No dropped ref, no swapped/duplicated
     * instance.
     */
    private drainReorderCommands() {
        const commands: unknown[] = this.state.repairQueue.reorderCommands;
        this.state.repairQueue.reorderCommands = [];
        for (const command of commands) {
            if (!isReorderRepairArg(command)) {
                continue;
            }
            const { operationId, index }: ReorderRepairArg = command;
            const ops = this.operations;
            const from = ops.findIndex((o) => o.id === operationId);
            if (from < 0 || ops[from].status !== RepairOperationStatus.QUEUED) {
                continue;
            }
            const minIndex = ops.length > 0 && ops[0].status === RepairOperationStatus.ACTIVE ? 1 : 0;
            const to = Math.max(minIndex, Math.min(Math.trunc(index), ops.length - 1));
            this.moveOperation(from, to);
        }
    }

    private moveOperation(from: number, to: number) {
        const ops = this.operations;
        const op = ops[from];
        if (from < to) {
            for (let i = from; i < to; i++) {
                ops[i] = ops[i + 1];
            }
        } else {
            for (let i = from; i > to; i--) {
                ops[i] = ops[i - 1];
            }
        }
        ops[to] = op;
    }

    private drainEnqueueCommands() {
        const commands: unknown[] = this.state.repairQueue.enqueueCommands;
        this.state.repairQueue.enqueueCommands = [];
        for (const command of commands) {
            if (!isEnqueueRepairArg(command)) {
                continue;
            }
            const { protocolId }: EnqueueRepairArg = command;
            if (this.operations.length >= MAX_REPAIR_QUEUE_LENGTH) {
                this.notifyRefusal('repair queue is full');
                continue;
            }
            const protocol = this.getProtocol(protocolId);
            if (!protocol) {
                this.notifyRefusal('unknown repair protocol');
                continue;
            }
            if (REPAIR_TIER_ORDER[protocol.tier] > REPAIR_TIER_ORDER[getEffectiveRepairTier(this.state)]) {
                this.notifyRefusal(`${protocol.name} requires a higher repair tier than this ship has`);
                continue;
            }
            if (!isProtocolAvailable(this.state, protocol)) {
                this.notifyRefusal(`${protocol.name} needs equipment this ship doesn't have`);
                continue;
            }
            if (protocol.consumesEnergyCell && this.reservedEnergyCells() >= this.state.reactor.energyCells) {
                this.notifyRefusal(`${protocol.name} needs an energy cell but none are available`);
                continue;
            }
            const op = new RepairOperation();
            op.id = makeId();
            op.protocolId = protocolId;
            op.status = RepairOperationStatus.QUEUED;
            this.operations.push(op);
        }
    }

    /**
     * A `docked`-tier operation loses its footing the instant the ship stops being docked
     * (undocking started, or forced e.g. by combat) — the repair queue is all-or-nothing, same as
     * an energy-starvation abort, so the operation is cancelled outright rather than left stalled
     * or silently allowed to keep running off-dock.
     */
    private cancelIfTierLost() {
        const active = this.getActive();
        if (!active) {
            return;
        }
        const protocol = this.getProtocol(active.protocolId);
        if (!protocol) {
            return;
        }
        if (REPAIR_TIER_ORDER[protocol.tier] > REPAIR_TIER_ORDER[getEffectiveRepairTier(this.state)]) {
            this.abort(active);
            this.notifyRefusal(`${protocol.name} was cancelled: ship no longer has the required repair tier`);
        }
    }

    private ensureActive() {
        if (this.getActive()) {
            return;
        }
        const next = this.operations.find((o) => o.status === RepairOperationStatus.QUEUED);
        if (!next) {
            return;
        }
        next.status = RepairOperationStatus.ACTIVE;
        const protocol = this.getProtocol(next.protocolId);
        if (protocol) {
            this.applySideEffects(next, protocol);
        }
    }

    private tickActive(deltaSeconds: number) {
        const active = this.getActive();
        if (!active) {
            return;
        }
        const protocol = this.getProtocol(active.protocolId);
        if (!protocol) {
            this.abort(active);
            return;
        }
        // A zero-draw protocol (e.g. reactorJumpStart, armorPlateRenewal) must be runnable from
        // true zero energy — but EnergyManager.trySpendEnergy checks `energy > value` (strictly
        // greater), so spending even nothing out of an exactly-empty reactor reads as a refusal.
        // Skip the spend attempt entirely rather than let that edge case starve a free operation.
        if (protocol.energyDraw > 0 && !this.energySource.trySpendEnergy(protocol.energyDraw * deltaSeconds)) {
            // brief dip: no progress/heat this tick, but the operation survives until the shortfall
            // is sustained past the grace window (R3) — then it's still all-or-nothing
            active.starvedSeconds += deltaSeconds;
            if (active.starvedSeconds >= ENERGY_STARVATION_GRACE_SECONDS) {
                this.abort(active);
            }
            return;
        }
        active.starvedSeconds = 0;
        this.applyHeat(protocol, deltaSeconds);
        active.progress = Math.min(1, active.progress + deltaSeconds / this.getDuration(protocol));
        if (active.progress >= 1) {
            this.complete(active, protocol);
        }
    }

    /** `dynamicDuration`, when declared, always wins over the static `duration` — see its doc comment. */
    private getDuration(protocol: RepairProtocolStats): number {
        return protocol.dynamicDuration ? protocol.dynamicDuration(this.state) : protocol.duration;
    }

    private complete(op: RepairOperation, protocol: RepairProtocolStats) {
        this.revertSideEffects(op);
        this.resetTargets(protocol);
        protocol.onComplete?.(this.state);
        op.progress = 1;
        this.finish(op, RepairOperationStatus.DONE);
    }

    private abort(op: RepairOperation) {
        this.revertSideEffects(op);
        this.finish(op, RepairOperationStatus.CANCELLED);
    }

    /** Moves `op` out of the live queue and into `recentlyFinished` for `TERMINAL_DISPLAY_SECONDS`. */
    private finish(op: RepairOperation, status: RepairOperationStatus) {
        op.status = status;
        op.starvedSeconds = 0;
        op.terminalSecondsRemaining = TERMINAL_DISPLAY_SECONDS;
        const index = this.operations.indexOf(op);
        if (index >= 0) {
            this.operations.splice(index, 1);
        }
        this.recentlyFinished.push(op);
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
     * the distinct target *system keys* (SPEC-0003) — and, when a key resolves to more than one
     * live instance (e.g. all 6 thrusters), split evenly again across those instances so the total
     * delivered stays `protocol.heat` regardless of how many instances the ship happens to have.
     *
     * Consequence (R2, PR #2030 review round 2, confirmed as intended): repair heat on a
     * multi-instance system can no longer push any *single* instance over the overheat threshold on
     * its own the way a single-instance system's full budget can — the per-instance share is always
     * a fraction of the total. The existing overheat-cascade test only exercises this because it
     * targets `docking` (single-instance); a multi-instance system reaching overheat via repair heat
     * alone would need a much larger `heat` budget than any current catalog entry declares.
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

    private applySideEffects(op: RepairOperation, protocol: RepairProtocolStats) {
        for (const key of protocol.sideEffectSystems) {
            getRepairableSystemInstances(this.state, key).forEach((instance, index) => {
                const entry = new SavedPowerEntry();
                entry.system = key;
                entry.index = index;
                entry.value = instance.power;
                op.savedPower.push(entry);
                instance.power = PowerLevel.SHUTDOWN;
            });
        }
    }

    private revertSideEffects(op: RepairOperation) {
        revertOperationSideEffects(this.state, op);
    }
}
