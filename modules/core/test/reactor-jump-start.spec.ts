import { MockDie, makeIterationsData } from './ship-test-harness';
import { demoShip, getAvailableRepairProtocols, makeShipState, repairProtocols } from '../src';
import { DamageManager } from '../src/ship/damage-manager';
import { EnergyManager } from '../src/ship/energy-manager';
import { HeatManager } from '../src/ship/heat-manager';
import { RepairManager } from '../src/ship/repair-manager';
import { SpaceManager } from '../src/logic/space-manager';
import { Spaceship } from '../src/space';
import { enqueueRepair } from '../src/ship/repair-commands';
import { expect } from 'chai';
import { tick } from './tick';

function setUpShip() {
    const shipId = 'test-ship';
    const state = makeShipState(shipId, demoShip);
    const spaceObject = new Spaceship();
    spaceObject.id = shipId;
    const spaceManager = new SpaceManager();
    spaceManager.insert(spaceObject);
    const die = new MockDie();
    const damageManager = new DamageManager(spaceObject, state, spaceManager, die);
    const heatManager = new HeatManager(state, damageManager);
    const energyManager = new EnergyManager(state, heatManager);
    const repairManager = new RepairManager(state, energyManager, heatManager);
    return { state, repairManager };
}

type TestShipState = ReturnType<typeof setUpShip>['state'];

function enqueue(state: TestShipState, protocolId: string) {
    enqueueRepair.setValue(state, { protocolId });
}

function runTicks(repairManager: RepairManager, durationSeconds: number, ticksPerSecond: number) {
    for (const id of makeIterationsData(durationSeconds, Math.round(durationSeconds * ticksPerSecond))) {
        repairManager.update(id);
    }
}

describe('reactorJumpStart (field-tier repair-queue protocol, issue #2137)', () => {
    it('is only available when the ship has at least one energy cell', () => {
        const { state } = setUpShip();
        state.reactor.energyCells = 0;
        expect(getAvailableRepairProtocols(state, repairProtocols)).to.not.have.property('reactorJumpStart');

        state.reactor.energyCells = 1;
        expect(getAvailableRepairProtocols(state, repairProtocols)).to.have.property('reactorJumpStart');
    });

    it('recovers a zero-energy, damaged reactor enough for normal repairs to progress', () => {
        const { state, repairManager } = setUpShip();
        state.reactor.energyCells = 1;
        state.reactor.energy = 0;
        state.reactor.effeciencyFactor = 0;

        enqueue(state, 'reactorJumpStart');
        runTicks(repairManager, repairProtocols.reactorJumpStart.duration + 0.1, 20);

        expect(state.repairQueue.recentlyFinished).to.have.lengthOf(1);
        expect(state.reactor.effeciencyFactor).to.be.closeTo(0.3, 0.01);
        expect(state.reactor.energy).to.be.closeTo(0.3 * state.reactor.design.maxEnergy, 1);
    });

    it('consumes exactly one energy cell per completed jump-start', () => {
        const { state, repairManager } = setUpShip();
        state.reactor.energyCells = 2;
        state.reactor.energy = 0;
        state.reactor.effeciencyFactor = 0;

        enqueue(state, 'reactorJumpStart');
        runTicks(repairManager, repairProtocols.reactorJumpStart.duration + 0.1, 20);

        expect(state.reactor.energyCells).to.equal(1);
    });

    it('refuses to enqueue a second jump-start beyond the cells actually available', () => {
        const { state, repairManager } = setUpShip();
        state.reactor.energyCells = 1;
        state.reactor.energy = 0;
        state.reactor.effeciencyFactor = 0;

        enqueue(state, 'reactorJumpStart');
        enqueue(state, 'reactorJumpStart');
        tick(repairManager, 0.1);

        expect(state.repairQueue.operations).to.have.lengthOf(1);
        expect(state.repairQueue.refusalReason).to.not.equal('');
    });

    it('never boosts reactor efficiency above the normal maximum', () => {
        const { state, repairManager } = setUpShip();
        state.reactor.energyCells = 1;
        state.reactor.energy = 0;
        state.reactor.effeciencyFactor = 0.9;

        enqueue(state, 'reactorJumpStart');
        runTicks(repairManager, repairProtocols.reactorJumpStart.duration + 0.1, 20);

        expect(state.reactor.effeciencyFactor).to.equal(1);
    });
});
