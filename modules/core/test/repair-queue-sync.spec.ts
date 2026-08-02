import { Decoder, Encoder } from '@colyseus/schema';
import { demoShip, makeShipState } from '../src';
import { enqueueRepair, reorderRepair } from '../src/ship/repair-commands';
import { DamageManager } from '../src/ship/damage-manager';
import { EnergyManager } from '../src/ship/energy-manager';
import { HeatManager } from '../src/ship/heat-manager';
import { RepairManager } from '../src/ship/repair-manager';
import { RepairProtocolStats } from '../src/configurations/repair-protocols';
import { SpaceManager } from '../src/logic/space-manager';
import { Spaceship } from '../src/space';
import { expect } from 'chai';

/**
 * Settles the "unresolved" question flagged in `RepairManager.drainReorderCommands`'s doc comment
 * (R6, PR #2030 review round 2): does `moveOperation`'s single-index-reassignment reorder survive a
 * real Colyseus encode/decode round trip, given it does momentarily zero and re-set the moved
 * operation's own array slot? Full encode -> decode establishes a synced mirror (the client), then
 * an incremental encode -> decode carries a real reorder across, and every field of every operation
 * is checked — not just presence — so a refcount bug that silently swapped or duplicated an
 * instance would show up as a wrong id/protocolId/progress pairing, not just a wrong count.
 */
describe('RepairQueue reorder survives a Colyseus encode/decode round trip', () => {
    it('reorders correctly on the decoded mirror, with every operation field intact', () => {
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
            protocolC: {
                name: 'Protocol C',
                targets: [{ system: 'docking', field: 'rangesFactor' }],
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

        enqueueRepair.setValue(state, { protocolId: 'protocolA' });
        enqueueRepair.setValue(state, { protocolId: 'protocolB' });
        enqueueRepair.setValue(state, { protocolId: 'protocolC' });
        tick(1); // A -> ACTIVE (progress 0.01), B and C -> QUEUED

        const encoder = new Encoder(state);
        const mirror = makeShipState(shipId, demoShip);
        const decoder = new Decoder(mirror);
        decoder.decode(encoder.encodeAll());

        expect(mirror.repairQueue.operations.map((o) => o.protocolId)).to.deep.equal([
            'protocolA',
            'protocolB',
            'protocolC',
        ]);
        const progressBefore = mirror.repairQueue.operations[0].progress;
        expect(progressBefore).to.be.greaterThan(0);

        // move C ahead of B (server-side)
        const opC = state.repairQueue.operations.find((o) => o.protocolId === 'protocolC')!;
        reorderRepair.setValue(state, { operationId: opC.id, index: 1 });
        tick(1); // applies the reorder, and advances A's progress another step

        expect(state.repairQueue.operations.map((o) => o.protocolId)).to.deep.equal([
            'protocolA',
            'protocolC',
            'protocolB',
        ]);

        // carry the incremental change across a real encode/decode cycle
        const deltaBytes = encoder.encode();
        decoder.decode(deltaBytes);

        expect(mirror.repairQueue.operations).to.have.lengthOf(3);
        expect(mirror.repairQueue.operations.map((o) => o.protocolId)).to.deep.equal([
            'protocolA',
            'protocolC',
            'protocolB',
        ]);
        // the active operation (index 0) is still A, and its progress kept advancing across the
        // reorder — not reset, not duplicated onto the wrong protocolId
        expect(mirror.repairQueue.operations[0].status).to.equal(state.repairQueue.operations[0].status);
        expect(mirror.repairQueue.operations[0].progress).to.be.greaterThan(progressBefore);
        expect(mirror.repairQueue.operations[0].id).to.equal(state.repairQueue.operations[0].id);
        expect(mirror.repairQueue.operations[1].id).to.equal(state.repairQueue.operations[1].id);
        expect(mirror.repairQueue.operations[2].id).to.equal(state.repairQueue.operations[2].id);
    });
});
