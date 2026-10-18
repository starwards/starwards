import {
    Asteroid,
    Faction,
    MISSILE_LAUNCH,
    Projectile,
    ScanLevel,
    ShipManagerPc,
    SmartPilotMode,
    SpaceManager,
    Spaceship,
    Vec2,
    XY,
    makeShipState,
    shipConfigurations,
} from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';

import { expect } from 'chai';
import { switchToAvailableAmmo } from '../src/ship/chain-gun-manager';
import { tick } from './tick';

// issue #2342: a missile leaves the tube unpowered and un-fuzed, then arms and ignites
// ~2 s later, ~1 unit off the hull.

function makeShip(id: string, x = 0, y = 0) {
    const ship = new Spaceship();
    ship.id = id;
    ship.radius = 50;
    ship.position = Vec2.make({ x, y });
    return ship;
}

function makeMissile(model: Projectile['model'], x: number, targetId: string, armingSeconds: number) {
    const missile = new Projectile(model);
    missile.init(`missile-${model}`, Vec2.make({ x, y: 0 }));
    missile.targetId = targetId;
    missile.secondsToLive = 30;
    missile.armingSeconds = armingSeconds;
    return missile;
}

describe('delayed missile launch (issue #2342)', () => {
    afterEach(() => jest.restoreAllMocks());

    it('an unarmed proximity missile within fuze range of its target does not detonate', () => {
        const spaceMgr = new SpaceManager();
        const target = makeShip('target', 0, 0);
        const missile = makeMissile('HiExpMissile', 90, target.id, MISSILE_LAUNCH.armingSeconds);
        spaceMgr.insertBulk([target, missile]);
        spaceMgr.forceFlushEntities();

        tick(spaceMgr, 0.05);

        expect(missile.destroyed).to.equal(false);
        expect([...spaceMgr.state.getAll('Explosion')].length).to.equal(0);
    });

    it('an unarmed contact missile colliding with a target does no damage and does not detonate', () => {
        const spaceMgr = new SpaceManager();
        const target = new Asteroid();
        target.id = 'target';
        target.radius = 50;
        const missile = makeMissile('ArmPenMissile', 51, target.id, MISSILE_LAUNCH.armingSeconds);
        missile.velocity = Vec2.make({ x: -10, y: 0 });
        spaceMgr.insertBulk([target, missile]);
        spaceMgr.forceFlushEntities();
        const healthBefore = target.health;

        for (let i = 0; i < 10; i++) {
            tick(spaceMgr, 0.05);
        }

        expect(missile.destroyed).to.equal(false);
        expect(target.health).to.equal(healthBefore);
    });

    it('an unarmed missile applies no homing thrust, and starts homing once armed', () => {
        const spaceMgr = new SpaceManager();
        const target = makeShip('target', 10_000, 0);
        const missile = makeMissile('HiExpMissile', 0, target.id, 1);
        spaceMgr.insertBulk([target, missile]);
        spaceMgr.forceFlushEntities();

        for (let i = 0; i < 18; i++) {
            tick(spaceMgr, 0.05);
        }
        expect(XY.lengthOf(missile.velocity)).to.equal(0);

        for (let i = 0; i < 10; i++) {
            tick(spaceMgr, 0.05);
        }
        expect(missile.armingSeconds).to.be.lessThanOrEqual(0);
        expect(XY.lengthOf(missile.velocity)).to.be.greaterThan(0);
    });

    it('an armed proximity missile within fuze range detonates (arming completes the fuze)', () => {
        const spaceMgr = new SpaceManager();
        const target = makeShip('target', 0, 0);
        const missile = makeMissile('HiExpMissile', 90, target.id, 0.1);
        spaceMgr.insertBulk([target, missile]);
        spaceMgr.forceFlushEntities();

        for (let i = 0; i < 4; i++) {
            tick(spaceMgr, 0.05);
        }

        expect(missile.destroyed).to.equal(true);
    });

    it('a tube launches a missile unarmed, which arms ~1 unit off the hull after the arming delay', () => {
        const spaceMgr = new SpaceManager();
        const shipObj = new Spaceship();
        shipObj.id = 'launcher';
        shipObj.faction = Faction.Gravitas;
        const die = new MockDie();
        die.expectedRoll = 1;
        const shipMgr = new ShipManagerPc(
            shipObj,
            makeShipState(shipObj.id, shipConfigurations['demo-ship']),
            spaceMgr,
            die,
        );
        spaceMgr.insert(shipObj);
        shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
        shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
        const tube = shipMgr.state.tubes[0];
        tube.loadAmmo = true;
        switchToAvailableAmmo(tube, shipMgr.state.magazine);
        for (const id of makeIterationsData(2, 40)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }
        tube.safetyLocked = false;
        shipMgr.state.fireTubesCommand = true;
        for (const id of makeIterationsData(0.05, 1)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        const [missile] = [...spaceMgr.state.getAll('Projectile')];
        expect(missile.design.homing).to.not.equal(null);
        expect(missile.armingSeconds).to.be.greaterThan(MISSILE_LAUNCH.armingSeconds - 0.1);
        // the firing faction knows its own missile fully, so it can jam it from launch
        expect(missile.scanLevels[Faction.Gravitas]).to.equal(ScanLevel.FULL);

        for (const id of makeIterationsData(MISSILE_LAUNCH.armingSeconds, 40)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }
        expect(missile.armingSeconds).to.be.lessThanOrEqual(0);
        const offHull = XY.distance(missile.position, shipObj.position) - shipObj.radius - missile.radius;
        expect(offHull).to.be.closeTo(MISSILE_LAUNCH.armingDistance, 0.5);
    });

    it('shells are fired armed', () => {
        const shell = new Projectile('HiExpShell');
        expect(shell.armingSeconds).to.equal(0);
    });
});
