import { Decoder, Encoder } from '@colyseus/schema';
import { demoShip, makeShipState } from '../src';
import { DamageManager } from '../src/ship/damage-manager';
import { EnergyManager } from '../src/ship/energy-manager';
import { HeatManager } from '../src/ship/heat-manager';
import { RepairManager } from '../src/ship/repair-manager';
import { RepairPriority } from '../src/ship/repair-queue';
import { RepairProtocolStats } from '../src/configurations/repair-protocols';
import { SpaceManager } from '../src/logic/space-manager';
import { Spaceship } from '../src/space';
import { cycleRepairPriority } from '../src/ship/repair-commands';
import { expect } from 'chai';

/**
 * Settles the same category of question the pre-#2247 reorder test settled for the old queue model
 * (R6, PR #2030 review round 2): does live per-protocol priority/progress state survive a real
 * Colyseus encode/decode round trip? `slots` is a fixed-size `ArraySchema` (one per catalog
 * protocol, never resized), so this exercises field-level updates on existing array entries rather
 * than the old model's insert/remove/reorder — but the same "not just presence, every field" bar
 * applies: a decoded mirror must carry the exact priority, progress and energy-cell state a real
 * client would render.
 */
describe('RepairQueue slot state survives a Colyseus encode/decode round trip', () => {
    it('priority, progress and RUNNING promotion all reach the decoded mirror correctly', () => {
        const shipId = 'test-ship';
        const state = makeShipState(shipId, demoShip);
        state.reactor.energy = state.reactor.design.maxEnergy;
        const spaceObject = new Spaceship();
        spaceObject.id = shipId;
        const spaceManager = new SpaceManager();
        spaceManager.insert(spaceObject);
        const damageManager = new DamageManager(spaceObject, state, spaceManager, {
            getRoll: () => 0,
            getSuccess: () => false,
            getRollInRange: (_, min) => min,
            getDrift: () => 0,
            getDriftInRange: (_, min) => min,
            getGaussian: (_, mean) => mean,
        });
        const heatManager = new HeatManager(state, damageManager);
        const energyManager = new EnergyManager(state, heatManager);
        const catalog: Record<string, RepairProtocolStats> = {
            protocolA: {
                name: 'Protocol A',
                targets: [{ system: 'thrusters', field: 'bearingSkew' }],
                duration: 100,
                energyDraw: 0,
                heat: 0,
                sideEffectSystems: [],
                tier: 'field',
            },
            protocolB: {
                name: 'Protocol B',
                targets: [{ system: 'magazine', field: 'capacity' }],
                duration: 100,
                energyDraw: 0,
                heat: 0,
                sideEffectSystems: [],
                tier: 'field',
            },
        };
        const repairManager = new RepairManager(state, energyManager, heatManager, catalog);
        const tick = (deltaSeconds: number) =>
            repairManager.update({ deltaSeconds, deltaSecondsAvg: deltaSeconds, totalSeconds: deltaSeconds });

        cycleRepairPriority.setValue(state, { protocolId: 'protocolA', direction: 'up' });
        cycleRepairPriority.setValue(state, { protocolId: 'protocolB', direction: 'up' });
        tick(1); // A -> RUNNING (progress 0.01), B stays LOW pending

        const encoder = new Encoder(state);
        const mirror = makeShipState(shipId, demoShip);
        const decoder = new Decoder(mirror);
        decoder.decode(encoder.encodeAll());

        expect(mirror.repairQueue.slots.map((s) => s.protocolId)).to.include.members(['protocolA', 'protocolB']);
        const mirrorA = mirror.repairQueue.slots.find((s) => s.protocolId === 'protocolA')!;
        const mirrorB = mirror.repairQueue.slots.find((s) => s.protocolId === 'protocolB')!;
        expect(mirrorA.priority).to.equal(RepairPriority.RUNNING);
        expect(mirrorB.priority).to.equal(RepairPriority.LOW);
        const progressBefore = mirrorA.progress;
        expect(progressBefore).to.be.greaterThan(0);

        // raise B to HIGH (still no pre-emption: A keeps running) — server-side
        cycleRepairPriority.setValue(state, { protocolId: 'protocolB', direction: 'up' });
        cycleRepairPriority.setValue(state, { protocolId: 'protocolB', direction: 'up' });
        tick(1); // applies the raise, and advances A's progress another step

        const stateA = state.repairQueue.slots.find((s) => s.protocolId === 'protocolA')!;
        const stateB = state.repairQueue.slots.find((s) => s.protocolId === 'protocolB')!;
        expect(stateA.priority).to.equal(RepairPriority.RUNNING);
        expect(stateB.priority).to.equal(RepairPriority.HIGH);

        // carry the incremental change across a real encode/decode cycle
        const deltaBytes = encoder.encode();
        decoder.decode(deltaBytes);

        expect(mirrorA.priority).to.equal(RepairPriority.RUNNING);
        expect(mirrorA.progress).to.be.greaterThan(progressBefore);
        expect(mirrorB.priority).to.equal(RepairPriority.HIGH);

        // now cancel A (wind-down) and let it reach 0%, decoding at each step
        cycleRepairPriority.setValue(state, { protocolId: 'protocolA', direction: 'down' });
        tick(0.01);
        decoder.decode(encoder.encode());
        expect(mirrorA.priority).to.equal(RepairPriority.CANCELLING);

        for (let i = 0; i < 5; i++) {
            tick(1); // 5s: plenty to finish A's wind-down (progress was ~0.01), nowhere near B's 100s duration
        }
        decoder.decode(encoder.encode());
        expect(mirrorA.priority).to.equal(RepairPriority.OFF);
        expect(mirrorA.progress).to.equal(0);
        // B, having been pending this whole time, is now RUNNING on both source and mirror
        expect(mirrorB.priority).to.equal(RepairPriority.RUNNING);
    });
});
