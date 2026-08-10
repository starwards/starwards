import { IterationData } from '../updateable';
import { ShipState } from './ship-state';

/**
 * Restocks the reactor's energy-cell reserve while docked (issue #2137): accrues toward
 * `design.maxEnergyCells` at `maxEnergyCells / cellRestockSeconds` cells/sec, mirroring
 * `AmmoManager`'s fractional-accrual pattern for ammo. Fractional progress is kept here rather
 * than on synced state — only the whole cells this deposits into `Reactor.energyCells` are
 * player-facing.
 *
 * Constructed and ticked from the base `ShipManager` (not `ShipManagerPc` only) so player and NPC
 * ships restock alike, same as `AmmoManager`.
 */
export class ReactorCellManager {
    private progress = 0;

    constructor(private state: ShipState) {}

    update({ deltaSeconds }: IterationData) {
        if (!this.state.docking.isDocked) {
            return;
        }
        const reactor = this.state.reactor;
        const max = reactor.design.maxEnergyCells;
        if (reactor.energyCells >= max) {
            this.progress = 0;
            return;
        }
        this.progress += (max / reactor.cellRestockSeconds) * deltaSeconds;
        const wholeCells = Math.floor(this.progress);
        if (wholeCells > 0) {
            reactor.energyCells = Math.min(max, reactor.energyCells + wholeCells);
        }
        this.progress -= wholeCells;
    }
}

/**
 * Whether `ReactorCellManager` is currently (or about to start, this tick) accruing energy cells
 * for this ship — same gate `ReactorCellManager.update` applies, exposed for UI so a client-visible
 * "restocking" state can never drift from the server's actual accrual condition.
 */
export function isRestockingEnergyCells(state: ShipState): boolean {
    return state.docking.isDocked && state.reactor.energyCells < state.reactor.design.maxEnergyCells;
}
