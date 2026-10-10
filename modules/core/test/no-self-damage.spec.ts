import { AmmoType, Explosion, Projectile, SpaceManager, Spaceship, Vec2, XY, ammoDesigns, ammoTypes } from '../src';

import { expect } from 'chai';
import fc from 'fast-check';
import { tick } from './tick';

// issue #2345: a ship's own projectiles and explosions never damage it nor push it. The exclusion
// is by firer id (projectile.shipId / explosion.shipId), not a disabled collision: the same
// round or blast with another ship's id still hits.

const FIRER_RADIUS = 50;
const FIRER_ID = 'firer';
const OTHER_ID = 'someone-else';

function makeFirer(heading: number, velocity: XY) {
    const ship = new Spaceship();
    ship.id = FIRER_ID;
    ship.radius = FIRER_RADIUS;
    ship.angle = heading;
    ship.position = Vec2.make({ x: 0, y: 0 });
    ship.velocity = Vec2.make(velocity);
    return ship;
}

/** Steps the space and drains every damage event queued against the firer (no ShipManager drains it here). */
function run(spaceMgr: SpaceManager, ship: Spaceship, ticksPerSecond: number, seconds: number) {
    let damageEvents = 0;
    const deltaSeconds = 1 / ticksPerSecond;
    for (let t = 0; t < seconds; t += deltaSeconds) {
        tick(spaceMgr, deltaSeconds, t + deltaSeconds);
        damageEvents += [...spaceMgr.resolveObjectDamage(ship.id)].length;
    }
    return damageEvents;
}

const ammo = fc.constantFrom(...(ammoTypes as readonly AmmoType[]));

describe('no self-damage from own fire (issue #2345)', () => {
    // The firer overtaking its own round (afterburner) is, in the firer's frame, the round closing
    // on the hull. Spawn it just outside the hull at an arbitrary mount bearing, closing inward.
    function contactScenario(
        shipId: string,
        heading: number,
        bearing: number,
        firerSpeed: number,
        closingSpeed: number,
        model: AmmoType,
    ) {
        // the firer is moving toward the round it is overtaking (the round sits along its course)
        const direction = heading + bearing;
        const firerVelocity = XY.byLengthAndDirection(firerSpeed, direction);
        const ship = makeFirer(heading, firerVelocity);
        const round = new Projectile(model);
        round.init('round', Vec2.make(XY.byLengthAndDirection(FIRER_RADIUS + 5, direction)));
        round.shipId = shipId;
        round.secondsToLive = 5;
        round.velocity = Vec2.make(XY.add(firerVelocity, XY.byLengthAndDirection(-closingSpeed, direction)));
        const spaceMgr = new SpaceManager();
        spaceMgr.insertBulk([ship, round]);
        spaceMgr.forceFlushEntities();
        return { spaceMgr, ship, firerVelocity };
    }

    const contactArbs = [
        fc.integer({ min: 0, max: 359 }), // firer heading
        fc.constantFrom(0, 45, 90, 135, 180, -90, -135), // mount bearing (incl. 135/180)
        fc.integer({ min: 0, max: 1500 }), // firer speed, incl. afterburner
        fc.integer({ min: 150, max: 400 }), // closing speed of the round on the hull
        ammo,
        fc.constantFrom(10, 20, 60), // tick rate
    ] as const;

    it('contact: own rounds never damage or push the firer', () => {
        fc.assert(
            fc.property(...contactArbs, (heading, bearing, firerSpeed, closingSpeed, model, tps) => {
                const { spaceMgr, ship, firerVelocity } = contactScenario(
                    FIRER_ID,
                    heading,
                    bearing,
                    firerSpeed,
                    closingSpeed,
                    model,
                );
                const damage = run(spaceMgr, ship, tps, 1);
                expect(damage, `${model} damage events`).to.equal(0);
                expect(XY.equals(ship.velocity, firerVelocity, 0.001), `${model} velocity`).to.equal(true);
            }),
            { numRuns: 100, seed: 2345 },
        );
    });

    // Control over impact rounds only: a proximity round's blast can spawn wholly inside or around
    // the hull, which yields no damage arc for anyone (pre-existing, see handleShipCollisionDamage);
    // the blast control below covers explosions with edge-crossing geometry.
    it('control: the same impact round fired by another ship does damage the hull', () => {
        const [h, b, fs, cs, , r] = contactArbs;
        fc.assert(
            fc.property(
                h,
                b,
                fs,
                cs,
                fc.constantFrom<AmmoType>('ArmPenShell', 'ArmPenMissile'),
                r,
                (heading, bearing, firerSpeed, closingSpeed, model, tps) => {
                    const { spaceMgr, ship } = contactScenario(
                        OTHER_ID,
                        heading,
                        bearing,
                        firerSpeed,
                        closingSpeed,
                        model,
                    );
                    expect(run(spaceMgr, ship, tps, 1), `${model} damage events`).to.be.greaterThan(0);
                },
            ),
            { numRuns: 100, seed: 2345 },
        );
    });

    function blastScenario(shipId: string, model: AmmoType, radius: number, offsetRatio: number, angle: number) {
        const ship = makeFirer(0, { x: 0, y: 0 });
        const explosion: Explosion = new Projectile(model).makeExplosion();
        // the blast edge must cross the hull edge: a blast wholly inside or wholly containing the
        // hull has no circle intersection to size a damage arc from (see handleShipCollisionDamage)
        const minOffset = Math.abs(FIRER_RADIUS - radius) + 1;
        const maxOffset = FIRER_RADIUS + radius - 1;
        const offset = minOffset + offsetRatio * (maxOffset - minOffset);
        explosion.init('blast', Vec2.make(XY.byLengthAndDirection(offset, angle)), explosion.damageFactor);
        explosion.radius = radius;
        explosion.expansionSpeed = 0; // keep the overlap geometry as sampled
        explosion.secondsToLive = 10;
        explosion.shipId = shipId;
        explosion.velocity = Vec2.make({ x: 0, y: 0 });
        const spaceMgr = new SpaceManager();
        spaceMgr.insertBulk([ship, explosion]);
        spaceMgr.forceFlushEntities();
        return { spaceMgr, ship };
    }

    const blastArbs = [
        fc.constantFrom<AmmoType>('HiExpShell', 'FragShell', 'HiExpMissile', 'FragMissile', 'ClusterMissile'),
        fc.integer({ min: 5, max: 400 }), // blast radius
        fc.double({ min: 0, max: 1, noNaN: true }), // offset, as a fraction of overlap range
        fc.integer({ min: 0, max: 359 }), // offset direction
        fc.constantFrom(5, 10, 20, 60), // tick rate
    ] as const;

    it('blasts: own explosion overlapping the firer causes no damage and no impulse', () => {
        fc.assert(
            fc.property(...blastArbs, (model, radius, offsetRatio, angle, tps) => {
                const { spaceMgr, ship } = blastScenario(FIRER_ID, model, radius, offsetRatio, angle);
                expect(run(spaceMgr, ship, tps, 0.5), 'damage events').to.equal(0);
                expect(XY.isZero(ship.velocity, 0.0001), 'impulse').to.equal(true);
            }),
            { numRuns: 100, seed: 2345 },
        );
    });

    it("control: another ship's explosion in the same place damages the hull", () => {
        fc.assert(
            fc.property(...blastArbs, (model, radius, offsetRatio, angle, tps) => {
                const { spaceMgr, ship } = blastScenario(OTHER_ID, model, radius, offsetRatio, angle);
                expect(run(spaceMgr, ship, tps, 0.5), 'damage events').to.be.greaterThan(0);
            }),
            { numRuns: 100, seed: 2345 },
        );
    });

    it('homing turn-back: a missile homing on a target behind the firer passes through it without a hit', () => {
        fc.assert(
            fc.property(
                fc.constantFrom<AmmoType>('HiExpMissile', 'ArmPenMissile', 'FragMissile', 'ClusterMissile'),
                fc.integer({ min: 0, max: 359 }), // firer heading
                fc.integer({ min: 150, max: 210 }), // target bearing: behind the firer
                fc.integer({ min: 2_000, max: 4_000 }), // target range
                fc.constantFrom(10, 20, 60), // tick rate
                (model, heading, targetBearing, targetRange, tps) => {
                    const ship = makeFirer(heading, { x: 0, y: 0 });
                    const target = new Spaceship();
                    target.id = 'target';
                    target.radius = FIRER_RADIUS;
                    target.position = Vec2.make(XY.byLengthAndDirection(targetRange, heading + targetBearing));
                    // launched forward, the missile must turn back through the firer's hull
                    const missile = new Projectile(model);
                    missile.init('missile', Vec2.make(XY.byLengthAndDirection(FIRER_RADIUS + 10, heading)));
                    missile.shipId = FIRER_ID;
                    missile.targetId = target.id;
                    missile.secondsToLive = ammoDesigns[model].homing?.secondsToLive ?? 30;
                    missile.angle = heading + 180;
                    missile.velocity = Vec2.make(XY.byLengthAndDirection(300, heading + 180));
                    const spaceMgr = new SpaceManager();
                    spaceMgr.insertBulk([ship, target, missile]);
                    spaceMgr.forceFlushEntities();
                    expect(run(spaceMgr, ship, tps, 2), `${model} damage events on firer`).to.equal(0);
                    expect(XY.isZero(ship.velocity, 0.0001), `${model} impulse on firer`).to.equal(true);
                },
            ),
            { numRuns: 50, seed: 2345 },
        );
    });
});
