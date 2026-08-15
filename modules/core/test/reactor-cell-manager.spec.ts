import { ReactorCellManager, isRestockingEnergyCells } from '../src/ship/reactor-cell-manager';
import { demoShip, makeShipState } from '../src';
import { DockingMode } from '../src/ship/docking';
import { expect } from 'chai';
import { makeIterationsData } from './ship-test-harness';

function setUpShip() {
    const state = makeShipState('test-ship', demoShip);
    return { state };
}

function runTicks(manager: ReactorCellManager, durationSeconds: number, ticksPerSecond: number) {
    for (const id of makeIterationsData(durationSeconds, Math.round(durationSeconds * ticksPerSecond))) {
        manager.update(id);
    }
}

describe('ReactorCellManager (issue #2137)', () => {
    it('does not restock energy cells while undocked', () => {
        const { state } = setUpShip();
        state.reactor.energyCells = 0;
        state.docking.mode = DockingMode.UNDOCKED;
        const manager = new ReactorCellManager(state);

        runTicks(manager, 60, 20);

        expect(state.reactor.energyCells).to.equal(0);
    });

    it('fills an empty reserve to design max within the configured restock duration while docked', () => {
        const { state } = setUpShip();
        state.reactor.cellRestockSeconds = 10;
        state.reactor.energyCells = 0;
        state.docking.mode = DockingMode.DOCKED;
        const manager = new ReactorCellManager(state);

        runTicks(manager, state.reactor.cellRestockSeconds, 20);

        expect(state.reactor.energyCells).to.equal(state.reactor.design.maxEnergyCells);
    });
});

describe('isRestockingEnergyCells', () => {
    it('is true only while docked with the reserve below design max', () => {
        const { state } = setUpShip();
        state.reactor.energyCells = 0;
        state.docking.mode = DockingMode.UNDOCKED;
        expect(isRestockingEnergyCells(state)).to.equal(false);

        state.docking.mode = DockingMode.DOCKED;
        expect(isRestockingEnergyCells(state)).to.equal(true);

        state.reactor.energyCells = state.reactor.design.maxEnergyCells;
        expect(isRestockingEnergyCells(state)).to.equal(false);
    });
});
