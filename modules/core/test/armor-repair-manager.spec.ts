import { demoShip, makeShipState } from '../src';
import { ArmorRepairManager } from '../src/ship/armor-repair-manager';
import { DockingMode } from '../src/ship/docking';
import { expect } from 'chai';
import { makeIterationsData } from './ship-test-harness';

function setUpShip() {
    const shipId = 'test-ship';
    const state = makeShipState(shipId, demoShip);
    const armorRepairManager = new ArmorRepairManager(state);
    return { state, armorRepairManager };
}

function runTicks(manager: ArmorRepairManager, durationSeconds: number, ticksPerSecond: number) {
    for (const id of makeIterationsData(durationSeconds, Math.round(durationSeconds * ticksPerSecond))) {
        manager.update(id);
    }
}

describe('ArmorRepairManager', () => {
    it('A1: a docked ship with several plates at varying damage reaches all-plates-full within the configured duration', () => {
        const { state, armorRepairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        state.docking.targetId = 'station-1';
        state.armor.armorPlates[0].layers[0].health = 0;
        state.armor.armorPlates[1].layers[0].health = state.armor.armorPlates[1].layers[0].maxHealth * 0.5;
        // plate 2 left undamaged

        runTicks(armorRepairManager, state.armor.repairSeconds + 0.1, 20);

        for (const plate of state.armor.armorPlates) {
            expect(plate.healthRatio).to.equal(1);
        }
    });

    it('A2: undocking mid-repair keeps the health regained; redocking resumes the climb', () => {
        const { state, armorRepairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        state.docking.targetId = 'station-1';
        const layer = state.armor.armorPlates[0].layers[0];
        layer.health = 0;

        runTicks(armorRepairManager, state.armor.repairSeconds / 2, 20);
        const midHealth = layer.health;
        expect(midHealth).to.be.greaterThan(0);
        expect(midHealth).to.be.lessThan(layer.maxHealth);

        state.docking.mode = DockingMode.UNDOCKED;
        runTicks(armorRepairManager, 5, 20);
        expect(layer.health).to.be.closeTo(midHealth, 0.01);

        state.docking.mode = DockingMode.DOCKED;
        runTicks(armorRepairManager, state.armor.repairSeconds, 20);
        expect(layer.health).to.equal(layer.maxHealth);
    });

    it('A3: plate health never exceeds plate max health', () => {
        const { state, armorRepairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        state.docking.targetId = 'station-1';

        runTicks(armorRepairManager, state.armor.repairSeconds * 2, 20);

        for (const plate of state.armor.armorPlates) {
            for (const layer of plate.layers) {
                expect(layer.health).to.equal(layer.maxHealth);
            }
        }
    });

    it('A4: no healing while DOCKING, UNDOCKING or UNDOCKED', () => {
        const { state, armorRepairManager } = setUpShip();
        const layer = state.armor.armorPlates[0].layers[0];
        layer.health = 0;
        state.docking.targetId = 'station-1';

        for (const mode of [DockingMode.DOCKING, DockingMode.UNDOCKING, DockingMode.UNDOCKED]) {
            state.docking.mode = mode;
            runTicks(armorRepairManager, 5, 20);
            expect(layer.health).to.equal(0);
        }
    });

    it('A4: no healing at game speed 0 (zero deltaSeconds)', () => {
        const { state, armorRepairManager } = setUpShip();
        const layer = state.armor.armorPlates[0].layers[0];
        layer.health = 0;
        state.docking.mode = DockingMode.DOCKED;
        state.docking.targetId = 'station-1';

        armorRepairManager.update({ deltaSeconds: 0, deltaSecondsAvg: 0, totalSeconds: 0 });

        expect(layer.health).to.equal(0);
    });

    it('A4: defensively, no healing for a ship docked to nothing (mode DOCKED but no target)', () => {
        const { state, armorRepairManager } = setUpShip();
        const layer = state.armor.armorPlates[0].layers[0];
        layer.health = 0;
        state.docking.mode = DockingMode.DOCKED;
        state.docking.targetId = '';

        runTicks(armorRepairManager, 5, 20);

        expect(layer.health).to.equal(0);
    });

    it('A5: repair has no memory of a docking-start snapshot — damage taken mid-repair is not undone by the next tick', () => {
        const { state, armorRepairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        state.docking.targetId = 'station-1';
        const layer = state.armor.armorPlates[0].layers[0];
        layer.health = 0;

        armorRepairManager.update({ deltaSeconds: 10, deltaSecondsAvg: 10, totalSeconds: 10 });
        const healedHealth = layer.health;
        expect(healedHealth).to.be.greaterThan(0);
        expect(healedHealth).to.be.lessThan(layer.maxHealth);

        layer.health = 0; // combat damage strips the plate again while still docked
        armorRepairManager.update({ deltaSeconds: 10, deltaSecondsAvg: 20, totalSeconds: 20 });

        // repair resumes from the just-damaged value, not from a stale pre-damage snapshot
        expect(layer.health).to.be.closeTo(healedHealth, 0.01);
    });

    it('A6: repairSeconds is one named, tweakable constant — tests derive expectations from it, not a hardcoded 150', () => {
        const { state, armorRepairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        state.docking.targetId = 'station-1';
        state.armor.repairSeconds = 10; // a GM speeding up a live session

        const layer = state.armor.armorPlates[0].layers[0];
        layer.health = 0;

        runTicks(armorRepairManager, state.armor.repairSeconds + 0.1, 20);

        expect(layer.health).to.equal(layer.maxHealth);
    });
});
