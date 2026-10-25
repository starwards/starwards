import {
    Faction,
    PowerLevel,
    RepairPriority,
    ShipManagerNpc,
    SpaceManager,
    Spaceship,
    makeShipState,
    shipConfigurations,
} from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';

import { expect } from 'chai';

function createNpc(realEnergy: boolean) {
    const spaceMgr = new SpaceManager();
    const shipObj = new Spaceship();
    shipObj.id = 'npc-energy';
    shipObj.faction = Faction.Gravitas;
    const state = makeShipState(shipObj.id, shipConfigurations.glaive);
    state.isPlayerShip = false;
    const shipMgr = new ShipManagerNpc(shipObj, state, spaceMgr, new MockDie());
    shipMgr.setRealEnergy(realEnergy);
    spaceMgr.insert(shipObj);
    const run = (seconds: number) => {
        for (const id of makeIterationsData(seconds, seconds * 20)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }
    };
    return { state, shipMgr, run };
}

describe('NPC real energy and repair (flag)', () => {
    it('is off by default: the reactor never moves', () => {
        const { state, shipMgr, run } = createNpc(false);
        expect(shipMgr.realEnergy).to.equal(false);
        const before = state.reactor.energy;
        run(5);
        expect(state.reactor.energy).to.equal(before);
    });

    it('flag on: draws meter the reactor and the repair queue gets slots', () => {
        const { state, shipMgr, run } = createNpc(true);
        expect(shipMgr.realEnergy).to.equal(true);
        state.reactor.energy = state.reactor.design.maxEnergy;
        state.smartPilot.maneuvering.x = 1;
        run(2);
        expect(state.reactor.energy).to.be.lessThan(state.reactor.design.maxEnergy);
        expect(state.repairQueue.slots.length).to.be.greaterThan(0);
    });

    describe('engineer governor', () => {
        it('sheds radar power when the reactor runs low and restores it after recovery', () => {
            const { state, run } = createNpc(true);
            const radar = state.radars[0];
            const original = radar.power;
            state.reactor.energy = state.reactor.design.maxEnergy * 0.1;
            run(0.5);
            expect(radar.power).to.be.lessThan(original);
            state.reactor.energy = state.reactor.design.maxEnergy;
            run(0.5);
            expect(radar.power).to.equal(original);
        });

        it('never sheds maneuvering power', () => {
            const { state, run } = createNpc(true);
            state.maneuvering.power = PowerLevel.NORMAL;
            state.reactor.energy = 0;
            run(1);
            expect(state.maneuvering.power).to.equal(PowerLevel.NORMAL);
        });
    });

    describe('reflex repair', () => {
        it('queues a protocol for a defect only after the noticing delay', () => {
            const { state, run } = createNpc(true);
            state.chainGuns[0].bearingSkew = 10;
            run(1);
            expect(state.repairQueue.slots.every((s) => s.priority === RepairPriority.OFF)).to.equal(true);
            run(15);
            expect(state.repairQueue.slots.some((s) => s.priority !== RepairPriority.OFF)).to.equal(true);
        });

        it('repairs the defect', () => {
            const { state, run } = createNpc(true);
            state.reactor.energy = state.reactor.design.maxEnergy;
            state.chainGuns[0].bearingSkew = 10;
            run(120);
            expect(state.chainGuns[0].bearingSkew).to.equal(0);
        });
    });
});
