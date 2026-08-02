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
    RepairProtocolStats,
    RepairProtocolTier,
    RepairableSystemKey,
    getRepairableSystemInstances,
    repairProtocols,
} from '../configurations/repair-protocols';
import { ShipState } from './ship-state';
import { getSystems } from './system';
import { makeId } from '../id';

const TIER_ORDER: Record<RepairProtocolTier, number> = { field: 0, docked: 1, shipyard: 2 };

/**
 * Hard cap on the queue's length (SPEC-0003 doesn't specify one; without it, `repairQueue.operations`
 * — a synced `ArraySchema` broadcast to every client and rendered as one Tweakpane folder per entry —
 * grows without bound). Repair work is always explicitly player-commanded (unlike e.g. signals jobs,
 * which are auto-discovered and therefore evict low-priority entries) — so once full, new enqueue
 * commands are refused rather than silently displacing a queued operation the crew asked for.
 */
export const MAX_REPAIR_QUEUE_LENGTH = 16;

/**
 * Reverts `op`'s declared side effects and clears the saved list. Called both by `RepairManager`
 * (done/cancelled) and by `resetShipState` (an operation left active across an NPC<->PC conversion
 * has no manager left to revert it otherwise — see `SavedPowerEntry`).
 *
 * Only restores a saved `power` value if nothing else changed it since the side effect forced it —
 * a player who commanded power on the affected system mid-operation (or a GM, or a second
 * operation) has their intent honored; a stale snapshot never overwrites it.
 */
export function revertOperationSideEffects(state: ShipState, op: RepairOperation) {
    for (const entry of op.savedPower) {
        const instance = getRepairableSystemInstances(state, entry.system as RepairableSystemKey)[entry.index];
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
 * (never moves a QUEUED entry to index 0 while one is active).
 */
export class RepairManager implements Updateable {
    constructor(
        private state: ShipState,
        private energySource: RepairEnergySource,
        private heatSink: RepairHeatSink,
        private tier: RepairProtocolTier = 'field',
        private catalog: Record<string, RepairProtocolStats> = repairProtocols,
    ) {}

    update({ deltaSeconds }: IterationData) {
        this.removeTerminalOperations();
        this.drainCancelCommands();
        this.drainReorderCommands();
        this.drainEnqueueCommands();
        this.ensureActive();
        this.tickActive(deltaSeconds);
    }

    private get operations() {
        return this.state.repairQueue.operations;
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

    private removeTerminalOperations() {
        for (let i = this.operations.length - 1; i >= 0; i--) {
            const status = this.operations[i].status;
            if (status === RepairOperationStatus.DONE || status === RepairOperationStatus.CANCELLED) {
                this.operations.splice(i, 1);
            }
        }
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
     * replacement (never add/remove) so no `RepairOperation` instance is ever dropped and
     * re-registered in the same change set.
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
                continue;
            }
            const protocol = this.getProtocol(protocolId);
            if (!protocol || TIER_ORDER[protocol.tier] > TIER_ORDER[this.tier]) {
                // unknown protocol id, or above the ship's current repair tier: refused
                continue;
            }
            const op = new RepairOperation();
            op.id = makeId();
            op.protocolId = protocolId;
            op.status = RepairOperationStatus.QUEUED;
            this.operations.push(op);
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
        if (!this.energySource.trySpendEnergy(protocol.energyDraw * deltaSeconds)) {
            // energy shortfall: all-or-nothing abort, spent costs lost, no restoration
            this.abort(active);
            return;
        }
        this.applyHeat(protocol, deltaSeconds);
        active.progress = Math.min(1, active.progress + deltaSeconds / protocol.duration);
        if (active.progress >= 1) {
            this.complete(active, protocol);
        }
    }

    private complete(op: RepairOperation, protocol: RepairProtocolStats) {
        this.revertSideEffects(op);
        this.resetTargets(protocol);
        op.progress = 1;
        op.status = RepairOperationStatus.DONE;
    }

    private abort(op: RepairOperation) {
        this.revertSideEffects(op);
        op.status = RepairOperationStatus.CANCELLED;
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
     */
    private applyHeat(protocol: RepairProtocolStats, deltaSeconds: number) {
        if (protocol.heat <= 0) {
            return;
        }
        const uniqueKeys = [...new Set(protocol.targets.map((t) => t.system))];
        if (uniqueKeys.length === 0) {
            return;
        }
        const perKeyHeatPerSecond = protocol.heat / protocol.duration / uniqueKeys.length;
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
