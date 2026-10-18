import {
    Faction,
    Projectile,
    ScanLevel,
    SpaceManager,
    Spaceship,
    Vec2,
    XY,
    ammoDesigns,
    setOmniRadarSector,
} from '../src';

import { expect } from 'chai';
import { tick } from './tick';

// issue #2151: missiles get a terminal sprint — inside ~3km of their target they
// accelerate dramatically, so evasion/point-defense can't be left to the last second.

const GENERIC_SHIP_RADIUS = 50;

function makeShip(id: string, x = 0, y = 0) {
    const ship = new Spaceship();
    ship.id = id;
    ship.radius = GENERIC_SHIP_RADIUS;
    ship.position.x = x;
    ship.position.y = y;
    return ship;
}

describe('missile terminal sprint (issue #2151)', () => {
    it('every missile design defines a terminal sprint range and speed boost', () => {
        for (const [model, design] of Object.entries(ammoDesigns)) {
            if (design.homing) {
                expect(design.homing.sprint, model).to.not.equal(undefined);
                expect(design.homing.sprint.range, model).to.be.greaterThan(0);
                expect(design.homing.sprint.speedMultiplier, model).to.be.greaterThan(1);
            }
        }
    });

    it('a homing missile accelerates far beyond its cruise max speed once inside the sprint range', () => {
        const spaceMgr = new SpaceManager();
        const target = makeShip('sprint-target', 10_000, 0);
        const missile = new Projectile('ArmPenMissile');
        missile.init('sprint-missile', Vec2.make({ x: 10_000 - 4_000, y: 0 }));
        missile.targetId = target.id;
        missile.secondsToLive = 30;
        spaceMgr.insertBulk([target, missile]);
        spaceMgr.forceFlushEntities();

        // let it fly to a steady cruise speed while still outside the sprint range
        let cruiseSpeed = 0;
        for (let i = 0; i < 200; i++) {
            tick(spaceMgr, 0.05);
            const distance = XY.distance(target.position, missile.position) - target.radius;
            if (distance <= ammoDesigns.ArmPenMissile.homing.sprint.range + 5) {
                break;
            }
            cruiseSpeed = XY.lengthOf(missile.velocity);
        }
        expect(cruiseSpeed).to.be.greaterThan(0);
        expect(cruiseSpeed).to.be.lessThanOrEqual(ammoDesigns.ArmPenMissile.homing.maxSpeed + 1);

        // continue until it either sprints past the design cruise cap or hits the target
        let sprintSpeed = cruiseSpeed;
        for (let i = 0; i < 200 && !missile.destroyed; i++) {
            tick(spaceMgr, 0.05);
            sprintSpeed = Math.max(sprintSpeed, XY.lengthOf(missile.velocity));
        }

        expect(sprintSpeed).to.be.greaterThan(ammoDesigns.ArmPenMissile.homing.maxSpeed);
    });
});

describe('missile terminal sprint from FULL scan range', () => {
    const design = ammoDesigns.ArmPenMissile;
    const SPRINT_CHECK_RANGE = 5_000;

    function sprintsAt(scanLevel: ScanLevel) {
        const spaceMgr = new SpaceManager();
        const shooter = makeShip('fsr-shooter', 0, -10_000);
        setOmniRadarSector(shooter, 20_000); // FULL scan holds only while the target is in sight
        (shooter as { faction: Faction }).faction = Faction.Gravitas;
        const target = makeShip('fsr-target', 0, 0);
        (target as { faction: Faction }).faction = Faction.Raiders;
        target.scanLevels[Faction.Gravitas] = scanLevel;
        const missile = new Projectile('ArmPenMissile');
        missile.init('fsr-missile', Vec2.make({ x: -(SPRINT_CHECK_RANGE + GENERIC_SHIP_RADIUS), y: 0 }));
        missile.shipId = shooter.id;
        missile.targetId = target.id;
        missile.secondsToLive = 30;
        missile.velocity = Vec2.make({ x: design.homing.maxSpeed, y: 0 });
        missile.angle = 0;
        spaceMgr.insertBulk([shooter, target, missile]);
        spaceMgr.forceFlushEntities();
        // half a second: still beyond the base sprint range
        for (let i = 0; i < 10; i++) {
            tick(spaceMgr, 0.05);
        }
        expect(XY.distance(target.position, missile.position) - target.radius).to.be.greaterThan(
            design.homing.sprint.range,
        );
        return XY.lengthOf(missile.velocity) > design.homing.maxSpeed + 1;
    }

    it('every missile ammo sprints from farther out at FULL scan', () => {
        for (const [model, ammo] of Object.entries(ammoDesigns)) {
            if (ammo.homing) {
                expect(design.homing.sprint.fullScanRange, model).to.be.greaterThan(design.homing.sprint.range);
            }
        }
    });

    it('sprints at 5km when the firing faction holds the target at FULL scan', () => {
        expect(sprintsAt(ScanLevel.FULL)).to.equal(true);
    });

    it('does not sprint at 5km when the firing faction holds the target at BASIC scan', () => {
        expect(sprintsAt(ScanLevel.BASIC)).to.equal(false);
    });
});
