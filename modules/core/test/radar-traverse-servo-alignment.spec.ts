import { MockDie, makeIterationsData } from './ship-test-harness';
import { demoShip, getAvailableRepairProtocols, makeShipState, repairProtocols } from '../src';
import { DamageManager } from '../src/ship/damage-manager';
import { EnergyManager } from '../src/ship/energy-manager';
import { HeatManager } from '../src/ship/heat-manager';
import { PowerLevel } from '../src/ship/system';
import { RepairManager } from '../src/ship/repair-manager';
import { RepairOperationStatus } from '../src/ship/repair-queue';
import { SpaceManager } from '../src/logic/space-manager';
import { Spaceship } from '../src/space';
import { enqueueRepair } from '../src/ship/repair-commands';
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

function enqueue(state: TestShipState, protocolId: string) {
    enqueueRepair.setValue(state, { protocolId });
}

function runTicks(repairManager: RepairManager, durationSeconds: number, ticksPerSecond: number) {
    for (const id of makeIterationsData(durationSeconds, Math.round(durationSeconds * ticksPerSecond))) {
        repairManager.update(id);
    }
}

describe('radarTraverseServoAlignment (field-tier repair-queue protocol, #2109)', () => {
    it('A2: appears in the engineer catalog at field tier and takes radars offline while active', () => {
        const { state } = setUpShip();
        const available = getAvailableRepairProtocols(state, repairProtocols);
        expect(available).to.have.property('radarTraverseServoAlignment');
        expect(available.radarTraverseServoAlignment.tier).to.equal('field');
        expect(available.radarTraverseServoAlignment.sideEffectSystems).to.include('radars');
    });

    it('A1: a radar with degraded turnSpeedFactor is restored to design value by running the protocol to completion', () => {
        const { state, repairManager } = setUpShip();
        state.radars[1].turnSpeedFactor = 0.6; // damaged; design normal is 1

        enqueue(state, 'radarTraverseServoAlignment');
        runTicks(repairManager, repairProtocols.radarTraverseServoAlignment.duration + 0.1, 20);

        expect(state.repairQueue.recentlyFinished).to.have.lengthOf(1);
        expect(state.repairQueue.recentlyFinished[0].status).to.equal(RepairOperationStatus.DONE);
        expect(state.radars[1].turnSpeedFactor).to.equal(1);
    });

    it('radars go dark while the operation runs, and power is restored on completion', () => {
        const { state, repairManager } = setUpShip();
        const priorPower = state.radars[1].power;
        enqueue(state, 'radarTraverseServoAlignment');
        tick(repairManager, 0.1); // promotes to active, applies side effect

        expect(state.radars[1].power).to.equal(PowerLevel.SHUTDOWN);

        runTicks(repairManager, repairProtocols.radarTraverseServoAlignment.duration, 20);
        expect(state.radars[1].power).to.equal(priorPower);
    });

    it('A3: turnSpeedFactor damage landing after the operation is already active is still cleared at completion — standard defectible-reset mechanism, nothing bespoke', () => {
        const { state, repairManager } = setUpShip();
        enqueue(state, 'radarTraverseServoAlignment');
        tick(repairManager, 0.1); // promotes to active while turnSpeedFactor is still at its normal value

        state.radars[1].turnSpeedFactor = 0.4; // fresh damage lands after the op is already running
        runTicks(repairManager, repairProtocols.radarTraverseServoAlignment.duration, 20); // op completes

        expect(state.radars[1].turnSpeedFactor).to.equal(1);
    });
});
