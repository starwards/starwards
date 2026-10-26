import {
    SmartPilotMode,
    Vec2,
    decodeShipSnapshot,
    encodeShipSnapshot,
    makeShipState,
    shipConfigurations,
    snapshotShipDriver,
} from '../src';

import { expect } from 'chai';

// SPEC-0008 PR 3: every Target Details panel draws from a snapshot through `snapshotShipDriver`,
// so each field those panels read must survive the snapshot encoding.
describe('ship snapshot', () => {
    it('round-trips the fields read by every Target Details panel', () => {
        const live = makeShipState('target', shipConfigurations['dragonfly-MK1']);
        live.reactor.energy = 123;
        live.reactor.energyCells = 2;
        live.maneuvering.afterBurnerFuel = 45;
        live.warp!.currentLevel = 3;
        live.warp!.desiredLevel = 4;
        live.warp!.jammed = true;
        live.magazine.count_HiExpShell = 7;
        live.chainGuns[0].loading = 0.5;
        live.chainGuns[0].isFiring = true;
        live.weaponsTarget.targetId = 'someone';
        live.weaponsTarget.enemyOnly = true;
        live.smartPilot.rotationMode = SmartPilotMode.TARGET;
        live.smartPilot.rotation = -0.5;
        live.spaceship.angle = 77;
        live.spaceship.turnSpeed = 12;
        live.spaceship.velocity = Vec2.make({ x: 3, y: 4 });
        live.antiDrift = 1;

        const { state } = snapshotShipDriver(decodeShipSnapshot(encodeShipSnapshot(live)));

        expect(state.reactor.energy).to.equal(123);
        expect(state.reactor.energyCells).to.equal(2);
        expect(state.reactor.design.maxEnergyCells).to.equal(live.reactor.design.maxEnergyCells);
        expect(state.maneuvering.afterBurnerFuel).to.equal(45);
        expect(state.hullDamaged).to.equal(live.hullDamaged);
        expect(state.warp?.currentLevel).to.equal(3);
        expect(state.warp?.desiredLevel).to.equal(4);
        expect(state.warp?.jammed).to.equal(true);
        expect(state.magazine.count_HiExpShell).to.equal(7);
        expect(state.magazine.design.max_HiExpShell).to.equal(live.magazine.design.max_HiExpShell);
        expect(state.chainGuns.length).to.equal(live.chainGuns.length);
        expect(state.chainGuns[0].loading).to.equal(0.5);
        expect(state.chainGuns[0].isFiring).to.equal(true);
        expect(state.weaponsTarget.targetId).to.equal('someone');
        expect(state.weaponsTarget.enemyOnly).to.equal(true);
        expect(state.smartPilot.rotationMode).to.equal(SmartPilotMode.TARGET);
        expect(state.smartPilot.rotation).to.equal(-0.5);
        expect(state.spaceship.angle).to.equal(77);
        expect(state.spaceship.turnSpeed).to.equal(12);
        expect(state.speed).to.be.closeTo(5, 0.01);
        expect(state.antiDrift).to.equal(1);
    });
});
