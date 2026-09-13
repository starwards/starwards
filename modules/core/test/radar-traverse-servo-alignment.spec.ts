import { MockDie, makeIterationsData } from './ship-test-harness';
import { demoShip, getAvailableRepairProtocols, makeShipState, repairProtocols } from '../src';
import { DamageManager } from '../src/ship/damage-manager';
import { EnergyManager } from '../src/ship/energy-manager';
import { HeatManager } from '../src/ship/heat-manager';
import { PowerLevel } from '../src/ship/system';
import { RepairManager } from '../src/ship/repair-manager';
import { RepairPriority } from '../src/ship/repair-queue';
import { SpaceManager } from '../src/logic/space-manager';
import { Spaceship } from '../src/space';
import { cycleRepairPriority } from '../src/ship/repair-commands';
import { expect } from 'chai';
import { tick } from './tick';

function setUpShip() {
    const shipId = 'test-ship';
    const state = makeShipState(shipId, demoShip);
    state.reactor.energy = state.reactor.design.maxEnergy;
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

describe('radarTraverseServoAlignment (field-tier repair protocol, #2109)', () => {
    it('A2: appears in the engineer catalog at field tier and takes radars offline while running', () => {
        const { state } = setUpShip();
        const available = getAvailableRepairProtocols(state, repairProtocols);
        expect(available).to.have.property('radarTraverseServoAlignment');
        expect(available.radarTraverseServoAlignment.tier).to.equal('field');
        expect(available.radarTraverseServoAlignment.sideEffectSystems).to.include('radars');
    });

    it('A1: a radar with degraded turnSpeedFactor is restored to design value by running the protocol to completion', () => {
        const { state, repairManager } = setUpShip();
        state.radars[1].turnSpeedFactor = 0.6; // damaged; design normal is 1

        raise(state, 'radarTraverseServoAlignment');
        runTicks(repairManager, repairProtocols.radarTraverseServoAlignment.duration + 0.1, 20);

        expect(slot(state, 'radarTraverseServoAlignment').priority).to.equal(RepairPriority.OFF);
        expect(state.radars[1].turnSpeedFactor).to.equal(1);
    });

    it('radars go dark while the run is active, and power is restored on completion', () => {
        const { state, repairManager } = setUpShip();
        const priorPower = state.radars[1].power;
        raise(state, 'radarTraverseServoAlignment');
        tick(repairManager, 0.1); // promotes to RUNNING, applies side effect

        expect(state.radars[1].power).to.equal(PowerLevel.SHUTDOWN);

        runTicks(repairManager, repairProtocols.radarTraverseServoAlignment.duration, 20);
        expect(state.radars[1].power).to.equal(priorPower);
    });

    it('A3: turnSpeedFactor damage landing after the run is already active is still cleared at completion — standard defectible-reset mechanism, nothing bespoke', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'radarTraverseServoAlignment');
        tick(repairManager, 0.1); // promotes to RUNNING while turnSpeedFactor is still at its normal value

        state.radars[1].turnSpeedFactor = 0.4; // fresh damage lands after the run is already active
        runTicks(repairManager, repairProtocols.radarTraverseServoAlignment.duration, 20); // run completes

        expect(state.radars[1].turnSpeedFactor).to.equal(1);
    });
});
