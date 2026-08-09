import { Projectile, SpaceManager, Spaceship, Vec2, XY, ammoDesigns, missileAmmoTypes } from '../src';

import { expect } from 'chai';

// Design decision (issue #2151): missiles get a terminal sprint — a dramatic but
// physically plausible acceleration burst once within ~3km of their tracked target,
// so targets can no longer sidestep them at leisure in the terminal phase.

function tick(spaceMgr: SpaceManager, deltaSeconds = 1) {
    spaceMgr.update({ deltaSeconds, deltaSecondsAvg: deltaSeconds, totalSeconds: deltaSeconds });
}

function makeShip(id: string, x: number, y: number) {
    const ship = new Spaceship();
    ship.id = id;
    ship.radius = 50;
    ship.position.x = x;
    ship.position.y = y;
    return ship;
}

describe('missile terminal sprint (issue #2151)', () => {
    it('every missile design declares a terminal sprint range and boost', () => {
        for (const model of missileAmmoTypes) {
            const homing = ammoDesigns[model].homing;
            expect(homing, model).to.not.equal(null);
            const sprint = homing?.terminalSprint;
            expect(sprint, model).to.not.equal(undefined);
            expect(sprint?.range, model).to.be.greaterThan(0);
            expect(sprint?.speedMultiplier, model).to.be.greaterThan(1);
        }
    });

    it('a homing missile stays at design maxSpeed while outside sprint range', () => {
        const spaceMgr = new SpaceManager();
        const target = makeShip('far-target', 20_000, 0);
        const missile = new Projectile('HiExpMissile');
        const sprintRange = ammoDesigns.HiExpMissile.homing.terminalSprint.range;
        missile.init('cruising-missile', Vec2.make({ x: 20_000 - sprintRange * 3, y: 0 }));
        missile.velocity = Vec2.make({ x: ammoDesigns.HiExpMissile.homing.maxSpeed, y: 0 });
        missile.targetId = target.id;
        missile.secondsToLive = 30;
        spaceMgr.insertBulk([target, missile]);
        spaceMgr.forceFlushEntities();

        tick(spaceMgr, 1);

        expect(XY.lengthOf(missile.velocity)).to.be.closeTo(ammoDesigns.HiExpMissile.homing.maxSpeed, 1);
    });

    it('a homing missile surges well past design maxSpeed once inside sprint range', () => {
        const spaceMgr = new SpaceManager();
        const sprintRange = ammoDesigns.HiExpMissile.homing.terminalSprint.range;
        const target = makeShip('near-target', sprintRange - 500, 0);
        const missile = new Projectile('HiExpMissile');
        missile.init('sprinting-missile', Vec2.make({ x: 0, y: 0 }));
        missile.velocity = Vec2.make({ x: ammoDesigns.HiExpMissile.homing.maxSpeed, y: 0 });
        missile.targetId = target.id;
        missile.secondsToLive = 30;
        spaceMgr.insertBulk([target, missile]);
        spaceMgr.forceFlushEntities();

        tick(spaceMgr, 1);

        const designMaxSpeed = ammoDesigns.HiExpMissile.homing.maxSpeed;
        // "dramatic" per the design decision: at least 50% faster than cruising maxSpeed
        expect(XY.lengthOf(missile.velocity)).to.be.greaterThan(designMaxSpeed * 1.5);
    });
});
