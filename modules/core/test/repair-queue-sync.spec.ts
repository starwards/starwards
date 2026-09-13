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
 * `RepairQueue.slots` is a fixed-size `ArraySchema<RepairProtocolSlot>` (one per catalog protocol,
 * never added to, removed from, or reordered — issue #2247). This settles that a slot's live state
 * — `priority` cycling through pending, `RUNNING`, `CANCELLING`, `OFF`, and `progress` moving with
 * it — reaches a real Colyseus-decoded mirror correctly, across both a full initial sync and an
 * incremental one.
 */
describe('RepairQueue slots survive a Colyseus encode/decode round trip', () => {
    it('priority and progress on the decoded mirror track the source through a promote/cancel cycle', () => {
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

        cycleRepairPriority.setValue(state, { protocolId: 'protocolB', direction: 'up' }); // stays pending
        cycleRepairPriority.setValue(state, { protocolId: 'protocolA', direction: 'up' });
        tick(10); // A -> RUNNING (progress 0.1), B stays LOW

        const encoder = new Encoder(state);
        const mirror = makeShipState(shipId, demoShip);
        const decoder = new Decoder(mirror);
        decoder.decode(encoder.encodeAll());

        expect(mirror.repairQueue.slots.map((s) => s.protocolId)).to.deep.equal(['protocolA', 'protocolB']);
        const slotA = () => mirror.repairQueue.slots.find((s) => s.protocolId === 'protocolA')!;
        const slotB = () => mirror.repairQueue.slots.find((s) => s.protocolId === 'protocolB')!;
        expect(slotA().priority).to.equal(RepairPriority.RUNNING);
        expect(slotB().priority).to.equal(RepairPriority.LOW);
        const progressBefore = slotA().progress;
        expect(progressBefore).to.be.greaterThan(0);

        // cancel A server-side — it should start winding down while B stays pending behind it
        cycleRepairPriority.setValue(state, { protocolId: 'protocolA', direction: 'down' });
        tick(1);

        expect(state.repairQueue.slots.find((s) => s.protocolId === 'protocolA')!.priority).to.equal(
            RepairPriority.CANCELLING,
        );

        // carry the incremental change across a real encode/decode cycle
        const deltaBytes = encoder.encode();
        decoder.decode(deltaBytes);

        expect(mirror.repairQueue.slots).to.have.lengthOf(2);
        expect(slotA().priority).to.equal(RepairPriority.CANCELLING);
        expect(slotA().progress).to.be.lessThan(progressBefore); // winding down, not stuck
        expect(slotB().priority).to.equal(RepairPriority.LOW); // still pending, not promoted yet
    });
});
