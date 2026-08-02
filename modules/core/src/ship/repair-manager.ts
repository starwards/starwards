import { IterationData, Updateable } from '../updateable';
import { PowerLevel, SystemState, getSystems } from './system';
import { RepairOperation, RepairOperationStatus, SavedPowerEntry } from './repair-queue';
import {
    RepairProtocolStats,
    RepairProtocolTier,
    RepairableSystemKey,
    repairProtocols,
} from '../configurations/repair-protocols';
import { ShipState } from './ship-state';
import { makeId } from '../id';

const TIER_ORDER: Record<RepairProtocolTier, number> = { field: 0, docked: 1, shipyard: 2 };

/**
 * Resolves a catalog target/side-effect system key to its live instance(s) on `state`. Standalone
 * (not a `RepairManager` method) so `revertOperationSideEffects` can run without a live manager —
 * needed by `resetShipState` on an NPC<->PC conversion, where no `RepairManager` for the cloned
 * state exists yet.
 */
export function getRepairableSystemInstances(state: ShipState, key: RepairableSystemKey): SystemState[] {
    switch (key) {
        case 'thrusters':
            return [...state.thrusters];
        case 'tubes':
            return [...state.tubes];
        case 'chainGun':
            return state.chainGun ? [state.chainGun] : [];
        case 'radars':
            return [...state.radars];
        case 'reactor':
            return [state.reactor];
        case 'smartPilot':
            return [state.smartPilot];
        case 'magazine':
            return [state.magazine];
        case 'warp':
            return [state.warp];
        case 'docking':
            return [state.docking];
        case 'maneuvering':
            return [state.maneuvering];
        case 'signals':
            return [state.signals];
    }
}

/**
 * Reverts `op`'s declared side effects (restores each saved `power` value) and clears the saved
 * list. Called both by `RepairManager` (done/cancelled) and by `resetShipState` (an operation
 * left active across an NPC<->PC conversion has no manager left to revert it otherwise — see
 * `SavedPowerEntry`).
 */
export function revertOperationSideEffects(state: ShipState, op: RepairOperation) {
    for (const entry of op.savedPower) {
        const instance = getRepairableSystemInstances(state, entry.system as RepairableSystemKey)[entry.index];
        if (instance) {
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
        const commands = this.state.repairQueue.cancelCommands;
        this.state.repairQueue.cancelCommands = [];
        for (const { operationId } of commands) {
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

    private drainReorderCommands() {
        const commands = this.state.repairQueue.reorderCommands;
        this.state.repairQueue.reorderCommands = [];
        for (const { operationId, index } of commands) {
            const ops = this.operations;
            const opIndex = ops.findIndex((o) => o.id === operationId);
            // the active operation cannot be demoted, only cancelled (SPEC-0003)
            if (opIndex < 0 || ops[opIndex].status !== RepairOperationStatus.QUEUED) {
                continue;
            }
            const reordered = [...ops];
            const [op] = reordered.splice(opIndex, 1);
            const clampedIndex = Math.max(0, Math.min(index, reordered.length));
            reordered.splice(clampedIndex, 0, op);
            // ArraySchema#splice only supports insertCount <= deleteCount, so replace the
            // whole array in one call rather than remove-then-insert as two operations.
            ops.splice(0, ops.length, ...reordered);
        }
    }

    private drainEnqueueCommands() {
        const commands = this.state.repairQueue.enqueueCommands;
        this.state.repairQueue.enqueueCommands = [];
        for (const { protocolId } of commands) {
            const protocol = this.catalog[protocolId];
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
        const protocol = this.catalog[next.protocolId];
        if (protocol) {
            this.applySideEffects(next, protocol);
        }
    }

    private tickActive(deltaSeconds: number) {
        const active = this.getActive();
        if (!active) {
            return;
        }
        const protocol = this.catalog[active.protocolId];
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
