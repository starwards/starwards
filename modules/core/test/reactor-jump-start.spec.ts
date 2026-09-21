import { MockDie, makeIterationsData } from './ship-test-harness';
import { RepairPriority, RepairProtocolMode } from '../src/ship/repair-queue';
import { demoShip, getAvailableRepairProtocols, getModeStats, makeShipState, repairProtocols } from '../src';
import { DamageManager } from '../src/ship/damage-manager';
import { EnergyManager } from '../src/ship/energy-manager';
import { HeatManager } from '../src/ship/heat-manager';
import { RepairManager } from '../src/ship/repair-manager';
import { SpaceManager } from '../src/logic/space-manager';
import { Spaceship } from '../src/space';
import { cycleRepairPriority } from '../src/ship/repair-commands';
import { expect } from 'chai';

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

function raise(state: TestShipState, protocolId: string) {
    cycleRepairPriority.setValue(state, { protocolId, direction: 'up' });
}

function slot(state: TestShipState, protocolId: string) {
    return state.repairQueue.slots.find((s) => s.protocolId === protocolId)!;
}

function runTicks(repairManager: RepairManager, durationSeconds: number, ticksPerSecond: number) {
    for (const id of makeIterationsData(durationSeconds, Math.round(durationSeconds * ticksPerSecond))) {
        repairManager.update(id);
    }
}

describe('reactorJumpStart (field-tier repair protocol, issue #2137)', () => {
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

        raise(state, 'reactorJumpStart');
        runTicks(
            repairManager,
            getModeStats(repairProtocols.reactorJumpStart, RepairProtocolMode.Responsive).duration + 0.1,
            20,
        );

        expect(slot(state, 'reactorJumpStart').priority).to.equal(RepairPriority.OFF);
        expect(state.reactor.effeciencyFactor).to.be.closeTo(0.3, 0.01);
        expect(state.reactor.energy).to.be.closeTo(0.3 * state.reactor.design.maxEnergy, 1);
    });

    it('spends exactly one energy cell the instant the jump-start starts running', () => {
        const { state, repairManager } = setUpShip();
        state.reactor.energyCells = 2;
        state.reactor.energy = 0;
        state.reactor.effeciencyFactor = 0;

        raise(state, 'reactorJumpStart');
        runTicks(repairManager, 0.1, 20); // promoted to RUNNING, well before completion

        expect(slot(state, 'reactorJumpStart').priority).to.equal(RepairPriority.RUNNING);
        expect(state.reactor.energyCells).to.equal(1);
    });

    it('does not spend a second cell on completion', () => {
        const { state, repairManager } = setUpShip();
        state.reactor.energyCells = 2;
        state.reactor.energy = 0;
        state.reactor.effeciencyFactor = 0;

        raise(state, 'reactorJumpStart');
        runTicks(
            repairManager,
            getModeStats(repairProtocols.reactorJumpStart, RepairProtocolMode.Responsive).duration + 0.1,
            20,
        );

        expect(state.reactor.energyCells).to.equal(1);
    });

    it('refuses to raise priority when no energy cells are available, with a per-slot reason', () => {
        const { state, repairManager } = setUpShip();
        state.reactor.energyCells = 0;

        raise(state, 'reactorJumpStart');
        runTicks(repairManager, 0.1, 20);

        expect(slot(state, 'reactorJumpStart').priority).to.equal(RepairPriority.OFF);
        expect(slot(state, 'reactorJumpStart').refusalReason).to.not.equal('');
    });

    it('refunds the cell if the run is cancelled (wind-down to 0%) before completion', () => {
        const { state, repairManager } = setUpShip();
        state.reactor.energyCells = 1;
        state.reactor.energy = 0;
        state.reactor.effeciencyFactor = 0;

        raise(state, 'reactorJumpStart');
        runTicks(repairManager, 0.1, 20);
        expect(state.reactor.energyCells).to.equal(0);

        cycleRepairPriority.setValue(state, { protocolId: 'reactorJumpStart', direction: 'down' }); // wind-down
        runTicks(
            repairManager,
            getModeStats(repairProtocols.reactorJumpStart, RepairProtocolMode.Responsive).duration + 0.1,
            20,
        );

        expect(slot(state, 'reactorJumpStart').priority).to.equal(RepairPriority.OFF);
        expect(state.reactor.energyCells).to.equal(1);
        // cancelled, not completed: the boost never landed
        expect(state.reactor.effeciencyFactor).to.equal(0);
    });

    it('never boosts reactor efficiency above the normal maximum', () => {
        const { state, repairManager } = setUpShip();
        state.reactor.energyCells = 1;
        state.reactor.energy = 0;
        state.reactor.effeciencyFactor = 0.9;

        raise(state, 'reactorJumpStart');
        runTicks(
            repairManager,
            getModeStats(repairProtocols.reactorJumpStart, RepairProtocolMode.Responsive).duration + 0.1,
            20,
        );

        expect(state.reactor.effeciencyFactor).to.equal(1);
    });
});
