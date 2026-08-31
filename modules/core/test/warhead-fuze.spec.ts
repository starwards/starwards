import { Asteroid, Projectile, SpaceManager, Spaceship, Vec2, XY, ammoDesigns } from '../src';

import { expect } from 'chai';

// Regression coverage for issue #1976: fuze behavior is a property of the warhead.
// Contact-fuzed warheads resolve as a single damage event at the point of impact
// and never spawn an Explosion object. Proximity-fuzed (AoE) warheads keep today's
// blast-object behavior, including detonating on lifetime expiry (backup time-fuze).

// Generic hull-sized radius for physics fixtures unrelated to any specific ship configuration.
const GENERIC_SHIP_RADIUS = 50;

function tick(spaceMgr: SpaceManager, deltaSeconds = 1) {
    spaceMgr.update({ deltaSeconds, deltaSecondsAvg: deltaSeconds, totalSeconds: deltaSeconds });
}

function makeShip(id: string, x = 0, y = 0) {
    const ship = new Spaceship();
    ship.id = id;
    ship.radius = GENERIC_SHIP_RADIUS;
    ship.position.x = x;
    ship.position.y = y;
    return ship;
}

const contactFuzedAmmo = ['ArmPenShell', 'ArmPenMissile', 'TandemMissile', 'ElecMissile'] as const;
const proximityFuzedAmmo = ['HiExpShell', 'FragShell', 'HiExpMissile', 'FragMissile'] as const;

// spec §8 warhead table: impact rounds carry a flat damage number; explosion rounds
// carry a per-second damageFactor plus blast size (expansionSpeed × secondsToLive) and linger
const impactDamagePins = {
    ArmPenShell: 30,
    ArmPenMissile: 60,
    TandemMissile: 50,
    ElecMissile: 25,
} as const;
const explosionPins = {
    HiExpShell: { damageFactor: 20, blastSize: 200, secondsToLive: 1 },
    FragShell: { damageFactor: 10, blastSize: 250, secondsToLive: 1 },
    HiExpMissile: { damageFactor: 50, blastSize: 350, secondsToLive: 0.35 },
    FragMissile: { damageFactor: 10, blastSize: 800, secondsToLive: 1.6 },
} as const;

describe('warhead fuze design (issue #1976)', () => {
    it('every contact-fuzed warhead is tagged contact', () => {
        for (const model of contactFuzedAmmo) {
            expect(ammoDesigns[model].fuze.type, model).to.equal('contact');
        }
        expect(ammoDesigns.ClusterMissile.warheads.ArmPen.fuze.type).to.equal('contact');
    });

    it('every proximity-fuzed (AoE) warhead is tagged proximity at 100m', () => {
        for (const model of proximityFuzedAmmo) {
            const fuze = ammoDesigns[model].fuze;
            expect(fuze.type, model).to.equal('proximity');
            expect(fuze.type === 'proximity' && fuze.range, model).to.equal(100);
        }
        const clusterFrag = ammoDesigns.ClusterMissile.warheads.Frag.fuze;
        expect(clusterFrag.type).to.equal('proximity');
        expect(clusterFrag.type === 'proximity' && clusterFrag.range).to.equal(100);
    });

    it('impact warheads carry the spec §8 flat damage numbers', () => {
        for (const [model, damage] of Object.entries(impactDamagePins)) {
            const warhead = ammoDesigns[model as keyof typeof impactDamagePins];
            expect(warhead.fuze.type === 'contact' && warhead.damage, model).to.equal(damage);
        }
        const clusterAP = ammoDesigns.ClusterMissile.warheads.ArmPen;
        expect(clusterAP.fuze.type === 'contact' && clusterAP.damage).to.equal(30);
    });

    it('explosion warheads carry the spec §8 blast numbers', () => {
        for (const [model, pin] of Object.entries(explosionPins)) {
            const warhead = ammoDesigns[model as keyof typeof explosionPins];
            if (warhead.fuze.type !== 'proximity') {
                throw new Error(`${model} should be proximity-fuzed`);
            }
            expect(warhead.explosion.damageFactor, model).to.equal(pin.damageFactor);
            expect(warhead.explosion.secondsToLive, model).to.equal(pin.secondsToLive);
            expect(warhead.explosion.expansionSpeed * warhead.explosion.secondsToLive, model).to.equal(pin.blastSize);
        }
        const clusterFrag = ammoDesigns.ClusterMissile.warheads.Frag;
        if (clusterFrag.fuze.type !== 'proximity') {
            throw new Error('cluster Frag mode should be proximity-fuzed');
        }
        expect(clusterFrag.explosion.damageFactor).to.equal(10);
        expect(clusterFrag.explosion.expansionSpeed * clusterFrag.explosion.secondsToLive).to.equal(750);
    });
});

describe('contact-fuzed warheads (issue #1976)', () => {
    it('a single collision produces exactly one damage event on a ship and no explosion', () => {
        const spaceMgr = new SpaceManager();
        const ship = makeShip('target-ship');
        const shell = new Projectile('ArmPenShell');
        shell.init('contact-shell', Vec2.make({ x: -(ship.radius + shell.radius + 2), y: 0 }));
        shell.velocity = Vec2.make({ x: 1000, y: 0 });
        shell.secondsToLive = 5;
        spaceMgr.insertBulk([ship, shell]);
        spaceMgr.forceFlushEntities();

        for (let i = 0; i < 20 && !shell.destroyed; i++) {
            tick(spaceMgr, 0.05);
        }

        expect(shell.destroyed, 'shell should be consumed on contact').to.equal(true);
        expect([...spaceMgr.state.getAll('Explosion')]).to.have.lengthOf(0);
        const damageEvents = [...spaceMgr.resolveObjectDamage(ship.id)];
        expect(damageEvents).to.have.lengthOf(1);
        expect(damageEvents[0].delivery).to.equal('impact');
        expect(damageEvents[0].amount).to.equal(30); // ArmPenShell flat damage, spec §8
    });

    it('a single collision against a non-ship target subtracts flat health, no explosion', () => {
        const spaceMgr = new SpaceManager();
        const asteroid = new Asteroid().init('rock', Vec2.make({ x: 0, y: 0 }), 50);
        const initialHealth = asteroid.health;
        const shell = new Projectile('ArmPenShell');
        shell.init('contact-shell-2', Vec2.make({ x: -(asteroid.radius + shell.radius + 2), y: 0 }));
        shell.velocity = Vec2.make({ x: 1000, y: 0 });
        shell.secondsToLive = 5;
        spaceMgr.insertBulk([asteroid, shell]);
        spaceMgr.forceFlushEntities();

        for (let i = 0; i < 20 && !shell.destroyed; i++) {
            tick(spaceMgr, 0.05);
        }

        expect(shell.destroyed).to.equal(true);
        expect([...spaceMgr.state.getAll('Explosion')]).to.have.lengthOf(0);
        expect(asteroid.health).to.be.lessThan(initialHealth);
    });

    it('expires as a dud on lifetime timeout — no explosion spawned', () => {
        const spaceMgr = new SpaceManager();
        const shell = new Projectile('ArmPenShell');
        shell.init('dud-shell', Vec2.make({ x: 10_000, y: 10_000 }));
        shell.secondsToLive = 0.1;
        spaceMgr.insertBulk([shell]);
        spaceMgr.forceFlushEntities();

        tick(spaceMgr, 0.2);
        tick(spaceMgr, 0.01); // flush any explosion that might have been queued

        expect(shell.destroyed).to.equal(true);
        expect([...spaceMgr.state.getAll('Explosion')]).to.have.lengthOf(0);
    });

    it('a contact-fuzed homing missile does not detonate near a target, only on actual collision', () => {
        const spaceMgr = new SpaceManager();
        const target = makeShip('target', 200, 0);
        const missile = new Projectile('ArmPenMissile');
        missile.init('armpen-missile', Vec2.make({ x: 200 - target.radius - 30, y: 0 }));
        missile.targetId = target.id;
        missile.secondsToLive = 5;
        spaceMgr.insertBulk([target, missile]);
        spaceMgr.forceFlushEntities();

        tick(spaceMgr, 0.2);

        expect(missile.destroyed, 'still within old proximityDetonation range, but contact-fuzed').to.equal(false);
        expect([...spaceMgr.state.getAll('Explosion')]).to.have.lengthOf(0);
    });
});

describe('proximity-fuzed warheads (issue #1976)', () => {
    it('detonates into an Explosion object on lifetime timeout (backup time-fuze)', () => {
        const spaceMgr = new SpaceManager();
        const shell = new Projectile('FragShell');
        shell.init('aoe-shell', Vec2.make({ x: 10_000, y: 10_000 }));
        shell.secondsToLive = 0.1;
        spaceMgr.insertBulk([shell]);
        spaceMgr.forceFlushEntities();

        tick(spaceMgr, 0.2);
        tick(spaceMgr, 0.01); // flush the explosion spawned by the timed-out projectile

        expect(shell.destroyed).to.equal(true);
        expect([...spaceMgr.state.getAll('Explosion')]).to.have.lengthOf(1);
    });

    it('an unguided round detonates near a target it flies past, without physically colliding', () => {
        const spaceMgr = new SpaceManager();
        const ship = makeShip('near-miss-target', 0, 0);
        const fuzeRange = ammoDesigns.FragShell.fuze.type === 'proximity' ? ammoDesigns.FragShell.fuze.range : 0;
        const passDistance = ship.radius + fuzeRange / 2; // inside the fuze range, outside the hull
        const shell = new Projectile('FragShell');
        shell.init('near-miss-shell', Vec2.make({ x: -1000, y: passDistance }));
        shell.velocity = Vec2.make({ x: 1000, y: 0 });
        shell.secondsToLive = 5;
        spaceMgr.insertBulk([ship, shell]);
        spaceMgr.forceFlushEntities();

        for (let i = 0; i < 60 && !shell.destroyed; i++) {
            tick(spaceMgr, 0.05);
        }
        tick(spaceMgr, 0.01); // flush the explosion spawned by the proximity fuze

        expect(shell.destroyed, 'proximity fuze should trigger before the shell would ever reach the hull').to.equal(
            true,
        );
        const explosions = [...spaceMgr.state.getAll('Explosion')];
        expect(explosions).to.have.lengthOf(1);
        const distanceFromHull = XY.distance(explosions[0].position, ship.position) - ship.radius;
        expect(distanceFromHull).to.be.greaterThan(shell.radius); // never actually touched the hull
    });

    it('explosion overlap streams damage events tagged with explosion delivery', () => {
        const spaceMgr = new SpaceManager();
        const ship = makeShip('blast-target');
        const shell = new Projectile('HiExpShell');
        shell.init('blast-shell', Vec2.make({ x: ship.radius + 5, y: 0 }));
        shell.secondsToLive = 0.01;
        spaceMgr.insertBulk([ship, shell]);
        spaceMgr.forceFlushEntities();

        tick(spaceMgr, 0.05); // time-fuze detonation next to the hull
        for (let i = 0; i < 10 && [...spaceMgr.resolveObjectDamage(ship.id)].length === 0; i++) {
            tick(spaceMgr, 0.05); // let the blast grow into the hull
        }
        tick(spaceMgr, 0.05);

        const damageEvents = [...spaceMgr.resolveObjectDamage(ship.id)];
        expect(damageEvents.length).to.be.greaterThan(0);
        for (const damage of damageEvents) {
            expect(damage.delivery).to.equal('explosion');
        }
    });
});
