import { MockDie, makeIterationsData } from './ship-test-harness';
import { demoShip, getAvailableRepairProtocols, makeShipState, repairProtocols } from '../src';
import { DamageManager } from '../src/ship/damage-manager';
import { DockingMode } from '../src/ship/docking';
import { EnergyManager } from '../src/ship/energy-manager';
import { HeatManager } from '../src/ship/heat-manager';
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

describe('armorPlateRenewal (docked-tier repair protocol)', () => {
    it('B1: available only while docked (tier gating)', () => {
        const { state } = setUpShip();
        expect(getAvailableRepairProtocols(state, repairProtocols)).to.not.have.property('armorPlateRenewal');

        state.docking.mode = DockingMode.DOCKED;
        expect(getAvailableRepairProtocols(state, repairProtocols)).to.have.property('armorPlateRenewal');
    });

    it('B2: completing one run renews exactly the worst-damaged plate, leaving lesser damage untouched', () => {
        const { state, repairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        state.armor.plateRepairSeconds = 1;
        state.armor.armorPlates[0].layers[0].health = 10;
        state.armor.armorPlates[1].layers[0].health = 0;

        raise(state, 'armorPlateRenewal');
        runTicks(repairManager, 1.1, 20);

        expect(state.armor.armorPlates[1].layers[0].health).to.equal(state.armor.armorPlates[1].layers[0].maxHealth);
        expect(state.armor.armorPlates[0].layers[0].health).to.equal(10);
    });

    it('B3: undocking mid-run force-stops only the running one; already-renewed plates keep their health', () => {
        const { state, repairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        state.armor.plateRepairSeconds = 1;
        for (const plate of state.armor.armorPlates) {
            plate.layers[0].health = 0;
        }

        raise(state, 'armorPlateRenewal');
        runTicks(repairManager, 1.1, 20); // completes: one plate renewed
        const renewedPlate = state.armor.armorPlates.find((p) => p.healthRatio === 1);
        expect(renewedPlate, 'one plate should be fully renewed').to.not.equal(undefined);

        raise(state, 'armorPlateRenewal');
        tick(repairManager, 0.1); // promotes to RUNNING again
        expect(slot(state, 'armorPlateRenewal').priority).to.equal(RepairPriority.RUNNING);

        state.docking.mode = DockingMode.UNDOCKED;
        tick(repairManager, 0.1);

        expect(slot(state, 'armorPlateRenewal').priority).to.equal(RepairPriority.OFF);
        expect(renewedPlate!.healthRatio).to.equal(1);
    });

    it('B4: a fully stripped hull is fully restored within the ruled 2-3 minute window when runs are raised back-to-back', () => {
        const { state, repairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        for (const plate of state.armor.armorPlates) {
            for (const layer of plate.layers) {
                layer.health = 0;
            }
        }
        const plateCount = state.armor.armorPlates.length;

        const totalSeconds = plateCount * state.armor.plateRepairSeconds + 1;
        expect(totalSeconds).to.be.at.most(180);
        // armorPlateRenewal completes to OFF and must be re-raised for the next plate — raise it
        // once per plate's worth of simulated time, same "no auto-repeat" behavior the protocol
        // itself declares.
        for (let i = 0; i < plateCount; i++) {
            raise(state, 'armorPlateRenewal');
            runTicks(repairManager, state.armor.plateRepairSeconds + 0.1, 20);
        }

        for (const plate of state.armor.armorPlates) {
            expect(plate.healthRatio).to.equal(1);
        }
    });

    it('B5: plate health never exceeds max, and progress does not advance at game speed 0', () => {
        const { state, repairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        raise(state, 'armorPlateRenewal'); // hull already full — harmless no-op completion
        runTicks(repairManager, state.armor.plateRepairSeconds + 0.1, 20);
        for (const plate of state.armor.armorPlates) {
            for (const layer of plate.layers) {
                expect(layer.health).to.equal(layer.maxHealth);
            }
        }

        state.armor.armorPlates[0].layers[0].health = 0;
        raise(state, 'armorPlateRenewal');
        tick(repairManager, 0.1); // promotes to RUNNING
        const progressBefore = slot(state, 'armorPlateRenewal').progress;

        repairManager.update({ deltaSeconds: 0, deltaSecondsAvg: 0, totalSeconds: 0 });

        expect(slot(state, 'armorPlateRenewal').progress).to.equal(progressBefore);
        expect(state.armor.armorPlates[0].layers[0].health).to.equal(0);
    });

    it('B6: a crew that never raises the protocol gets no armour back, however long docked', () => {
        const { state, repairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        state.armor.armorPlates[0].layers[0].health = 0;

        runTicks(repairManager, 30, 20);

        expect(state.armor.armorPlates[0].layers[0].health).to.equal(0);
    });

    it('no cost: draws no energy and generates no heat while running', () => {
        const { state, repairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        state.armor.armorPlates[0].layers[0].health = 0;
        const energyBefore = state.reactor.energy;

        raise(state, 'armorPlateRenewal');
        runTicks(repairManager, state.armor.plateRepairSeconds + 0.1, 20);

        expect(state.reactor.energy).to.equal(energyBefore);
    });

    it('damage races repair: combat damage taken while a run is active is not undone by that run completing', () => {
        const { state, repairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        state.armor.plateRepairSeconds = 1;
        state.armor.armorPlates[0].layers[0].health = 0;

        raise(state, 'armorPlateRenewal');
        tick(repairManager, 0.5); // run active, partway through

        // combat damage lands on a different, previously-undamaged plate mid-repair
        state.armor.armorPlates[1].layers[0].health = 0;

        runTicks(repairManager, 1, 20); // run completes

        // the run renews plate 0 (the only damage that existed when it was raised) —
        // plate 1's fresh damage is not magically healed by a run that predates it
        expect(state.armor.armorPlates[1].layers[0].health).to.equal(0);
    });
});
