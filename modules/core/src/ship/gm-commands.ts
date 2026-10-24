import { ShipState } from './ship-state';
import { fixArmor } from './armor';
import { getSystems } from './system';
import { magazineStocks } from '../space/projectile';
import { withLockBypass } from '../lock-registry';

/*
 * GM quick actions on one ship. The server has no per-connection identity (see `GM_SET_VALUE`),
 * so "GM-only" means these message names are sent only by the GM screen's tweak panel; no crew
 * station, bot or MCP tool sends them. Like the tweak panel's value writes they bypass property
 * locks (the GM outranks the lock). They apply on receipt: the GM's click is a one-shot override,
 * not a simulated process, so there is nothing to spread across ticks.
 */

/** Refills ammo (every magazine stock), reactor energy and energy cells, and afterburner fuel. */
function resupplyShip(state: ShipState) {
    withLockBypass(() => {
        for (const at of magazineStocks) {
            state.magazine.setCount(at, state.magazine.getMax(at));
        }
        state.reactor.energy = state.reactor.design.maxEnergy;
        state.reactor.energyCells = state.reactor.design.maxEnergyCells;
        state.maneuvering.afterBurnerFuel = state.maneuvering.design.maxAfterBurnerFuel;
    });
}

/** Restores every armor layer to full health and every defectible system factor to its normal value. */
function repairShip(state: ShipState) {
    withLockBypass(() => {
        fixArmor(state.armor);
        for (const system of getSystems(state)) {
            for (const defectible of system.defectibles) {
                (system.state as unknown as Record<string, number>)[defectible.field] = defectible.normal;
            }
        }
    });
}

export const gmResupply = {
    cmdName: 'gmResupply',
    setValue: (state: ShipState) => resupplyShip(state),
};

export const gmRepair = {
    cmdName: 'gmRepair',
    setValue: (state: ShipState) => repairShip(state),
};
