import { MockDie, makeIterationsData } from './ship-test-harness';
import { RepairPriority, RepairProtocolMode } from '../src/ship/repair-queue';
import { cycleRepairPriority, toggleRepairProtocolMode } from '../src/ship/repair-commands';
import { demoShip, getModeStats, makeShipState, repairProtocols } from '../src';
import { DamageManager } from '../src/ship/damage-manager';
import { EnergyManager } from '../src/ship/energy-manager';
import { HeatManager } from '../src/ship/heat-manager';
import { PowerLevel } from '../src/ship/system';
import { RepairManager } from '../src/ship/repair-manager';
import { SpaceManager } from '../src/logic/space-manager';
import { Spaceship } from '../src/space';
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

function runTicks(repairManager: RepairManager, durationSeconds: number, ticksPerSecond: number) {
    for (const id of makeIterationsData(durationSeconds, Math.round(durationSeconds * ticksPerSecond))) {
        repairManager.update(id);
    }
}

describe('fireControlAlignment (field-tier repair protocol)', () => {
    it('Dark mode takes the smart pilot offline; Responsive takes nothing offline', () => {
        expect(
            getModeStats(repairProtocols.fireControlAlignment, RepairProtocolMode.Responsive).sideEffectSystems,
        ).to.deep.equal([]);
        expect(
            getModeStats(repairProtocols.fireControlAlignment, RepairProtocolMode.Dark).sideEffectSystems,
        ).to.deep.equal(['smartPilot']);
    });

    it('the smart pilot goes dark while a Dark run is active, and its power is restored on completion', () => {
        const { state, repairManager } = setUpShip();
        const priorPower = state.smartPilot.power;
        toggleRepairProtocolMode.setValue(state, { protocolId: 'fireControlAlignment' });
        cycleRepairPriority.setValue(state, { protocolId: 'fireControlAlignment', direction: 'up' });
        tick(repairManager, 0.1); // promotes to RUNNING, applies side effect

        expect(state.smartPilot.power).to.equal(PowerLevel.SHUTDOWN);

        const duration = getModeStats(repairProtocols.fireControlAlignment, RepairProtocolMode.Dark).duration;
        runTicks(repairManager, duration, 20);
        const slot = state.repairQueue.slots.find((s) => s.protocolId === 'fireControlAlignment')!;
        expect(slot.priority).to.equal(RepairPriority.OFF);
        expect(state.smartPilot.power).to.equal(priorPower);
    });

    it('the smart pilot keeps its power through a Responsive run', () => {
        const { state, repairManager } = setUpShip();
        const priorPower = state.smartPilot.power;
        cycleRepairPriority.setValue(state, { protocolId: 'fireControlAlignment', direction: 'up' });
        tick(repairManager, 0.1);

        expect(state.smartPilot.power).to.equal(priorPower);
    });
});
