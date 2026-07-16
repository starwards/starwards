import { Asteroid, Projectile, SpaceManager, Spaceship, Vec2, XY, ammoDesigns } from '../src';

import { expect } from 'chai';

// Regression coverage for issue #1976: fuze behavior is a property of the warhead.
// Contact-fuzed warheads resolve as a single damage event at the point of impact
// and never spawn an Explosion object. Proximity-fuzed (AoE) warheads keep today's
// blast-object behavior, including detonating on lifetime expiry (backup time-fuze).

function tick(spaceMgr: SpaceManager, deltaSeconds = 1) {
    spaceMgr.update({ deltaSeconds, deltaSecondsAvg: deltaSeconds, totalSeconds: deltaSeconds });
}

function makeShip(id: string, x = 0, y = 0) {
    const ship = new Spaceship();
    ship.id = id;
    ship.radius = Spaceship.radius;
    ship.position.x = x;
    ship.position.y = y;
    return ship;
}

const contactFuzedAmmo = ['HiExpShell', 'ArmPenShell', 'HiExpMissile', 'ArmPenMissile', 'TandemMissile'] as const;
const proximityFuzedAmmo = ['FragShell', 'FragMissile', 'ElecMissile'] as const;

describe('warhead fuze design (issue #1976)', () => {
    it('every contact-fuzed warhead is tagged contact', () => {
        for (const model of contactFuzedAmmo) {
            expect(ammoDesigns[model].fuze.type, model).to.equal('contact');
        }
        expect(ammoDesigns.ClusterMissile.warheads.ArmPen.fuze.type).to.equal('contact');
    });

    it('every proximity-fuzed (AoE) warhead is tagged proximity, with a detonation range', () => {
        for (const model of proximityFuzedAmmo) {
            const fuze = ammoDesigns[model].fuze;
            expect(fuze.type, model).to.equal('proximity');
            expect(fuze.type === 'proximity' && fuze.range, model).to.be.greaterThan(0);
        }
        const clusterFrag = ammoDesigns.ClusterMissile.warheads.Frag.fuze;
        expect(clusterFrag.type).to.equal('proximity');
    });
});

describe('contact-fuzed warheads (issue #1976)', () => {
    it('a single collision produces exactly one damage event on a ship and no explosion', () => {
        const spaceMgr = new SpaceManager();
        const ship = makeShip('target-ship');
        const shell = new Projectile('HiExpShell');
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
        expect([...spaceMgr.resolveObjectDamage(ship.id)]).to.have.lengthOf(1);
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
        const shell = new Projectile('HiExpShell');
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
        const distanceFromHull = XY.lengthOf(XY.difference(explosions[0].position, ship.position)) - ship.radius;
        expect(distanceFromHull).to.be.greaterThan(shell.radius); // never actually touched the hull
    });
});
