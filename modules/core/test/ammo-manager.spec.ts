import { ShipManagerNpc, ShipManagerPc } from '../src/ship/ship-manager';
import { demoShip, makeShipState } from '../src';
import { AmmoManager } from '../src/ship/ammo-manager';
import { DockingMode } from '../src/ship/docking';
import { MockDie } from './ship-test-harness';
import { SpaceManager } from '../src/logic/space-manager';
import { Spaceship } from '../src/space';
import { expect } from 'chai';
import { makeIterationsData } from './ship-test-harness';

function setUpShip() {
    const state = makeShipState('test-ship', demoShip);
    return { state };
}

function tickOnce(ammoManager: AmmoManager, deltaSeconds: number) {
    ammoManager.update({ deltaSeconds, deltaSecondsAvg: deltaSeconds, totalSeconds: deltaSeconds });
}

function runTicks(ammoManager: AmmoManager, durationSeconds: number, ticksPerSecond: number) {
    for (const id of makeIterationsData(durationSeconds, Math.round(durationSeconds * ticksPerSecond))) {
        ammoManager.update(id);
    }
}

describe('AmmoManager', () => {
    it('does not accrue rounds while UNDOCKED or DOCKING (approach)', () => {
        const { state } = setUpShip();
        state.magazine.setCount('HiExpMissile', 0);
        const ammoManager = new AmmoManager(state);

        state.docking.mode = DockingMode.UNDOCKED;
        runTicks(ammoManager, 5, 20);
        expect(state.magazine.getCount('HiExpMissile')).to.equal(0);

        state.docking.mode = DockingMode.DOCKING;
        runTicks(ammoManager, 5, 20);
        expect(state.magazine.getCount('HiExpMissile')).to.equal(0);
    });

    it('does not accrue at game speed 0 (zero deltaSeconds) even while docked', () => {
        const { state } = setUpShip();
        state.magazine.setCount('HiExpMissile', 0);
        state.docking.mode = DockingMode.DOCKED;
        const ammoManager = new AmmoManager(state);

        for (let i = 0; i < 50; i++) {
            tickOnce(ammoManager, 0);
        }

        expect(state.magazine.getCount('HiExpMissile')).to.equal(0);
    });

    it('fills an empty magazine to capacity within the configured restock duration while docked', () => {
        const { state } = setUpShip();
        state.magazine.restockDurationSeconds = 10;
        const duration = state.magazine.restockDurationSeconds;
        state.magazine.setCount('HiExpMissile', 0);
        state.magazine.setCount('HiExpShell', 0);
        state.docking.mode = DockingMode.DOCKED;
        const ammoManager = new AmmoManager(state);

        runTicks(ammoManager, duration, 20);

        expect(state.magazine.getCount('HiExpMissile')).to.equal(state.magazine.getMax('HiExpMissile'));
        expect(state.magazine.getCount('HiExpShell')).to.equal(state.magazine.getMax('HiExpShell'));
    });

    it('undocking mid-restock keeps whole rounds already accrued; re-docking resumes toward full', () => {
        const { state } = setUpShip();
        state.magazine.restockDurationSeconds = 10;
        const duration = state.magazine.restockDurationSeconds;
        state.magazine.setCount('HiExpMissile', 0);
        state.docking.mode = DockingMode.DOCKED;
        const ammoManager = new AmmoManager(state);

        runTicks(ammoManager, duration * 0.4, 20);
        const partial = state.magazine.getCount('HiExpMissile');
        const expectedPartial = Math.floor(state.magazine.getMax('HiExpMissile') * 0.4);
        expect(partial).to.be.closeTo(expectedPartial, 1);
        expect(partial).to.be.greaterThan(0);

        state.docking.mode = DockingMode.UNDOCKED;
        runTicks(ammoManager, 5, 20);
        expect(state.magazine.getCount('HiExpMissile')).to.equal(partial);

        state.docking.mode = DockingMode.DOCKED;
        runTicks(ammoManager, duration, 20);
        expect(state.magazine.getCount('HiExpMissile')).to.equal(state.magazine.getMax('HiExpMissile'));
    });

    it('never exceeds capacity-scaled max, including when capacity grows mid-restock', () => {
        const { state } = setUpShip();
        state.magazine.restockDurationSeconds = 10;
        const duration = state.magazine.restockDurationSeconds;
        state.magazine.capacity = 0.5;
        state.magazine.setCount('HiExpMissile', 0);
        state.docking.mode = DockingMode.DOCKED;
        const ammoManager = new AmmoManager(state);

        runTicks(ammoManager, duration, 20);
        expect(state.magazine.getCount('HiExpMissile')).to.equal(state.magazine.getMax('HiExpMissile'));

        state.magazine.capacity = 1;
        runTicks(ammoManager, duration, 20);
        expect(state.magazine.getCount('HiExpMissile')).to.equal(state.magazine.getMax('HiExpMissile'));
        expect(state.magazine.getCount('HiExpMissile')).to.be.at.most(state.magazine.design.max_HiExpMissile);
    });

    it('restocks player and NPC ships alike, without special-casing isPlayerShip', () => {
        const spaceManager = new SpaceManager();
        const die = new MockDie();

        const pcObj = new Spaceship();
        pcObj.id = 'pc-ship';
        spaceManager.insert(pcObj);
        const pcState = makeShipState(pcObj.id, demoShip);
        const pcManager = new ShipManagerPc(pcObj, pcState, spaceManager, die);
        pcState.magazine.restockDurationSeconds = 10;
        pcState.magazine.setCount('HiExpMissile', 0);
        pcState.docking.mode = DockingMode.DOCKED;
        // the demo ship's tube auto-loads HiExpMissile from the magazine by default (loadAmmo);
        // disabled here so that unrelated auto-load behavior doesn't compete with restock for
        // the same rounds — this test is only about AmmoManager's wiring, not weapon loading.
        pcState.tubes[0].loadAmmo = false;

        const npcObj = new Spaceship();
        npcObj.id = 'npc-ship';
        spaceManager.insert(npcObj);
        const npcState = makeShipState(npcObj.id, demoShip);
        const npcManager = new ShipManagerNpc(npcObj, npcState, spaceManager, die);
        npcState.magazine.restockDurationSeconds = 10;
        npcState.magazine.setCount('HiExpMissile', 0);
        npcState.docking.mode = DockingMode.DOCKED;
        npcState.tubes[0].loadAmmo = false;

        for (const id of makeIterationsData(10, 200)) {
            pcManager.update(id);
            npcManager.update(id);
        }

        expect(pcState.magazine.getCount('HiExpMissile')).to.equal(pcState.magazine.getMax('HiExpMissile'));
        expect(npcState.magazine.getCount('HiExpMissile')).to.equal(npcState.magazine.getMax('HiExpMissile'));
    });
});
