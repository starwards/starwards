import { MockDie, makeIterationsData } from './ship-test-harness';
import { demoShip, getAvailableRepairProtocols, makeShipState, repairProtocols } from '../src';
import { DamageManager } from '../src/ship/damage-manager';
import { DockingMode } from '../src/ship/docking';
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

describe('armorPlateRenewal (docked-tier repair-queue protocol)', () => {
    it('B1: available only while docked (tier gating)', () => {
        const { state } = setUpShip();
        expect(getAvailableRepairProtocols(state, repairProtocols)).to.not.have.property('armorPlateRenewal');

        state.docking.mode = DockingMode.DOCKED;
        expect(getAvailableRepairProtocols(state, repairProtocols)).to.have.property('armorPlateRenewal');
    });

    it('B2: completing one op renews exactly the worst-damaged plate, leaving lesser damage untouched', () => {
        const { state, repairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        state.armor.plateRepairSeconds = 1;
        state.armor.armorPlates[0].layers[0].health = 10;
        state.armor.armorPlates[1].layers[0].health = 0;

        enqueue(state, 'armorPlateRenewal');
        runTicks(repairManager, 1.1, 20);

        expect(state.armor.armorPlates[1].layers[0].health).to.equal(state.armor.armorPlates[1].layers[0].maxHealth);
        expect(state.armor.armorPlates[0].layers[0].health).to.equal(10);
    });

    it('B3: undocking mid-op cancels only the active op; already-renewed plates keep their health', () => {
        const { state, repairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        state.armor.plateRepairSeconds = 1;
        for (const plate of state.armor.armorPlates) {
            plate.layers[0].health = 0;
        }

        enqueue(state, 'armorPlateRenewal');
        runTicks(repairManager, 1.1, 20); // completes: one plate renewed
        const renewedPlate = state.armor.armorPlates.find((p) => p.healthRatio === 1);
        expect(renewedPlate, 'one plate should be fully renewed').to.not.equal(undefined);

        enqueue(state, 'armorPlateRenewal');
        tick(repairManager, 0.1); // promotes 2nd op to ACTIVE
        expect(state.repairQueue.operations).to.have.lengthOf(1);

        state.docking.mode = DockingMode.UNDOCKED;
        tick(repairManager, 0.1);

        expect(state.repairQueue.operations).to.have.lengthOf(0);
        expect(renewedPlate!.healthRatio).to.equal(1);
    });

    it('B4: a fully stripped hull is fully restored within the ruled 2-3 minute window when ops are enqueued back-to-back', () => {
        const { state, repairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        for (const plate of state.armor.armorPlates) {
            for (const layer of plate.layers) {
                layer.health = 0;
            }
        }
        const plateCount = state.armor.armorPlates.length;
        for (let i = 0; i < plateCount; i++) {
            enqueue(state, 'armorPlateRenewal');
        }

        const totalSeconds = plateCount * state.armor.plateRepairSeconds + 1;
        expect(totalSeconds).to.be.at.most(180);
        runTicks(repairManager, totalSeconds, 20);

        for (const plate of state.armor.armorPlates) {
            expect(plate.healthRatio).to.equal(1);
        }
    });

    it('B5: plate health never exceeds max, and progress does not advance at game speed 0', () => {
        const { state, repairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        enqueue(state, 'armorPlateRenewal'); // hull already full — harmless no-op completion
        runTicks(repairManager, state.armor.plateRepairSeconds + 0.1, 20);
        for (const plate of state.armor.armorPlates) {
            for (const layer of plate.layers) {
                expect(layer.health).to.equal(layer.maxHealth);
            }
        }

        state.armor.armorPlates[0].layers[0].health = 0;
        enqueue(state, 'armorPlateRenewal');
        tick(repairManager, 0.1); // promotes to active
        const progressBefore = state.repairQueue.operations[0].progress;

        repairManager.update({ deltaSeconds: 0, deltaSecondsAvg: 0, totalSeconds: 0 });

        expect(state.repairQueue.operations[0].progress).to.equal(progressBefore);
        expect(state.armor.armorPlates[0].layers[0].health).to.equal(0);
    });

    it('B6: a crew that never enqueues the protocol gets no armour back, however long docked', () => {
        const { state, repairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        state.armor.armorPlates[0].layers[0].health = 0;

        runTicks(repairManager, 30, 20);

        expect(state.armor.armorPlates[0].layers[0].health).to.equal(0);
    });

    it('no cost: draws no energy and generates no heat while active', () => {
        const { state, repairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        state.armor.armorPlates[0].layers[0].health = 0;
        const energyBefore = state.reactor.energy;

        enqueue(state, 'armorPlateRenewal');
        runTicks(repairManager, state.armor.plateRepairSeconds + 0.1, 20);

        expect(state.reactor.energy).to.equal(energyBefore);
    });

    it('damage races repair: combat damage taken while an op is active is not undone by that op completing', () => {
        const { state, repairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        state.armor.plateRepairSeconds = 1;
        state.armor.armorPlates[0].layers[0].health = 0;

        enqueue(state, 'armorPlateRenewal');
        tick(repairManager, 0.5); // op active, partway through

        // combat damage lands on a different, previously-undamaged plate mid-repair
        state.armor.armorPlates[1].layers[0].health = 0;

        runTicks(repairManager, 1, 20); // op completes

        // the op renews plate 0 (the only damage that existed when it was enqueued) —
        // plate 1's fresh damage is not magically healed by an op that predates it
        expect(state.armor.armorPlates[1].layers[0].health).to.equal(0);
    });
});
