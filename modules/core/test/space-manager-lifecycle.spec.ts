import { Asteroid, Explosion, Faction, Projectile, ScanLevel, SpaceManager, Spaceship, Vec2, XY } from '../src';

import { expect } from 'chai';
import { setOmniRadarSector } from '../src';

// Behavior tests for SpaceManager command processing, object lifecycle,
// freeze semantics, attachments, and the faction tracking registry.

function tick(spaceMgr: SpaceManager, deltaSeconds = 1) {
    spaceMgr.update({ deltaSeconds, deltaSecondsAvg: deltaSeconds, totalSeconds: deltaSeconds });
}

function makeShip(id: string, x = 0, y = 0, faction = Faction.NONE) {
    const ship = new Spaceship();
    ship.id = id;
    ship.position.x = x;
    ship.position.y = y;
    ship.faction = faction;
    return ship;
}

function makeAsteroid(id: string, x = 0, y = 0, radius = 10) {
    return new Asteroid().init(id, Vec2.make({ x, y }), radius);
}

describe('SpaceManager lifecycle', () => {
    it('createAsteroidCommands spawn an asteroid and are consumed', () => {
        const spaceMgr = new SpaceManager();
        spaceMgr.state.createAsteroidCommands.push({ position: { x: 100, y: 200 }, radius: 50 });
        tick(spaceMgr);
        const asteroids = [...spaceMgr.state.getAll('Asteroid')];
        expect(asteroids).to.have.lengthOf(1);
        expect(asteroids[0].radius).to.equal(50);
        expect(asteroids[0].position.x).to.equal(100);
        expect(asteroids[0].position.y).to.equal(200);
        expect(spaceMgr.state.createAsteroidCommands).to.have.lengthOf(0);
    });

    it('createExplosionCommands spawn an explosion and are consumed', () => {
        const spaceMgr = new SpaceManager();
        spaceMgr.state.createExplosionCommands.push({ position: { x: 5, y: 6 }, damageFactor: 3 });
        tick(spaceMgr, 0.01);
        const explosions = [...spaceMgr.state.getAll('Explosion')];
        expect(explosions).to.have.lengthOf(1);
        expect(explosions[0].damageFactor).to.be.closeTo(3, 0.01);
        expect(spaceMgr.state.createExplosionCommands).to.have.lengthOf(0);
    });

    it('createWaypointCommands spawn a frozen waypoint and are consumed', () => {
        const spaceMgr = new SpaceManager();
        spaceMgr.state.createWaypointCommands.push({ position: { x: 7, y: 8 } });
        tick(spaceMgr);
        const waypoints = [...spaceMgr.state.getAll('Waypoint')];
        expect(waypoints).to.have.lengthOf(1);
        expect(waypoints[0].freeze).to.equal(true);
        expect(spaceMgr.state.createWaypointCommands).to.have.lengthOf(0);
    });

    it('moveCommands translate objects by delta and are consumed', () => {
        const spaceMgr = new SpaceManager();
        const rock = makeAsteroid('rock', 10, 20);
        spaceMgr.insert(rock);
        spaceMgr.forceFlushEntities();
        spaceMgr.state.moveCommands.push({ ids: ['rock'], delta: { x: 50, y: -10 } });
        tick(spaceMgr, 0.01);
        expect(rock.position.x).to.be.closeTo(60, 0.1);
        expect(rock.position.y).to.be.closeTo(10, 0.1);
        expect(spaceMgr.state.moveCommands).to.have.lengthOf(0);
    });

    it('destroyObject marks expendable ships destroyed and queues a destroySpaceshipCommand', () => {
        const spaceMgr = new SpaceManager();
        const ship = makeShip('doomed');
        spaceMgr.insert(ship);
        spaceMgr.forceFlushEntities();
        spaceMgr.destroyObject('doomed');
        expect(ship.destroyed).to.equal(true);
        expect(spaceMgr.state.destroySpaceshipCommands).to.include('doomed');
    });

    it('destroyObject ignores unknown ids and non-expendable objects', () => {
        const spaceMgr = new SpaceManager();
        const rock = makeAsteroid('precious');
        rock.expendable = false;
        spaceMgr.insert(rock);
        spaceMgr.forceFlushEntities();
        expect(() => spaceMgr.destroyObject('no-such-id')).to.not.throw();
        spaceMgr.destroyObject('precious');
        expect(rock.destroyed).to.equal(false);
    });

    it('destroyed objects are removed from state after the GC timeout', () => {
        const spaceMgr = new SpaceManager();
        spaceMgr.insert(makeAsteroid('rock'));
        spaceMgr.forceFlushEntities();
        spaceMgr.destroyObject('rock');
        tick(spaceMgr, 6); // GC_TIMEOUT is 5 seconds
        expect(spaceMgr.state.get('rock')).to.equal(undefined);
    });

    it('checkDuplicateShip finds ships pending insertion and after flush', () => {
        const spaceMgr = new SpaceManager();
        spaceMgr.insert(makeShip('dup'));
        expect(spaceMgr.checkDuplicateShip('dup')).to.not.equal(undefined);
        spaceMgr.forceFlushEntities();
        expect(spaceMgr.checkDuplicateShip('dup')).to.not.equal(undefined);
        expect(spaceMgr.checkDuplicateShip('other')).to.equal(undefined);
    });
});

describe('SpaceManager velocity and turn mutators', () => {
    it('changeVelocity and changeTurnSpeed accumulate deltas', () => {
        const spaceMgr = new SpaceManager();
        const rock = makeAsteroid('rock');
        spaceMgr.insert(rock);
        spaceMgr.forceFlushEntities();
        spaceMgr.changeVelocity('rock', { x: 10, y: 5 });
        spaceMgr.changeVelocity('rock', { x: -4, y: 1 });
        expect(rock.velocity.x).to.be.closeTo(6, 0.01);
        expect(rock.velocity.y).to.be.closeTo(6, 0.01);
        spaceMgr.changeTurnSpeed('rock', 30);
        spaceMgr.changeTurnSpeed('rock', -10);
        expect(rock.turnSpeed).to.be.closeTo(20, 0.01);
    });

    it('setVelocity replaces velocity but ignores NaN', () => {
        const spaceMgr = new SpaceManager();
        const rock = makeAsteroid('rock');
        spaceMgr.insert(rock);
        spaceMgr.forceFlushEntities();
        spaceMgr.setVelocity('rock', { x: 3, y: 4 });
        expect(rock.velocity.x).to.be.closeTo(3, 0.01);
        expect(rock.velocity.y).to.be.closeTo(4, 0.01);
        spaceMgr.setVelocity('rock', { x: NaN, y: 0 });
        expect(rock.velocity.x).to.be.closeTo(3, 0.01);
        expect(rock.velocity.y).to.be.closeTo(4, 0.01);
    });

    it('mutators ignore destroyed objects', () => {
        const spaceMgr = new SpaceManager();
        const rock = makeAsteroid('rock');
        spaceMgr.insert(rock);
        spaceMgr.forceFlushEntities();
        spaceMgr.destroyObject('rock');
        spaceMgr.setVelocity('rock', { x: 9, y: 9 });
        spaceMgr.changeTurnSpeed('rock', 9);
        expect(XY.isZero(rock.velocity, 0.01)).to.equal(true);
        expect(rock.turnSpeed).to.equal(0);
    });
});

describe('SpaceManager freeze semantics', () => {
    it('frozen objects do not move and their velocity is zeroed', () => {
        const spaceMgr = new SpaceManager();
        const rock = makeAsteroid('rock', 100, 100);
        rock.velocity.x = 50;
        rock.freeze = true;
        spaceMgr.insert(rock);
        spaceMgr.forceFlushEntities();
        tick(spaceMgr);
        expect(rock.position.x).to.equal(100);
        expect(XY.isZero(rock.velocity, 0.01)).to.equal(true);
    });

    it('frozen explosions do not grow or expire, unfrozen ones do', () => {
        const spaceMgr = new SpaceManager();
        const frozen = new Explosion().init('frozen', Vec2.make({ x: 0, y: 0 }), 1);
        frozen.freeze = true;
        const active = new Explosion().init('active', Vec2.make({ x: 10_000, y: 0 }), 1);
        const frozenRadius = frozen.radius;
        const frozenTtl = frozen.secondsToLive;
        const activeRadius = active.radius;
        spaceMgr.insertBulk([frozen, active]);
        spaceMgr.forceFlushEntities();
        tick(spaceMgr, 0.1);
        expect(frozen.radius).to.equal(frozenRadius);
        expect(frozen.secondsToLive).to.equal(frozenTtl);
        expect(active.radius).to.be.greaterThan(activeRadius);
    });

    it('frozen projectiles do not age, unfrozen ones explode when timed out', () => {
        const spaceMgr = new SpaceManager();
        const frozen = new Projectile();
        frozen.init('frozen-shell', Vec2.make({ x: 0, y: 0 }));
        frozen.secondsToLive = 5;
        frozen.freeze = true;
        const active = new Projectile('FragShell'); // proximity-fuzed: still detonates (AoE) on timeout
        active.init('active-shell', Vec2.make({ x: 10_000, y: 0 }));
        active.secondsToLive = 0.5;
        spaceMgr.insertBulk([frozen, active]);
        spaceMgr.forceFlushEntities();
        tick(spaceMgr);
        expect(frozen.secondsToLive).to.equal(5);
        expect(frozen.destroyed).to.equal(false);
        expect(active.destroyed).to.equal(true);
        tick(spaceMgr, 0.01); // flush the explosion spawned by the timed-out projectile
        const explosions = [...spaceMgr.state.getAll('Explosion')];
        expect(explosions.length).to.be.greaterThan(0);
    });
});

describe('SpaceManager attachments', () => {
    it('attached objects move with their attachee and lose their own velocity', () => {
        const spaceMgr = new SpaceManager();
        const anchor = makeShip('anchor');
        const rider = makeAsteroid('rider', 0, 100);
        rider.velocity.x = 999; // should be zeroed while attached
        anchor.velocity.x = 100;
        spaceMgr.insertBulk([anchor, rider]);
        spaceMgr.forceFlushEntities();
        spaceMgr.attach('rider', 'anchor');
        tick(spaceMgr);
        expect(anchor.position.x).to.be.closeTo(100, 0.5);
        expect(rider.position.x).to.be.closeTo(100, 0.5);
        expect(rider.position.y).to.be.closeTo(100, 0.5);
        expect(XY.isZero(rider.velocity, 0.01)).to.equal(true);
    });

    it('attached objects rotate around the attachee', () => {
        const spaceMgr = new SpaceManager();
        const anchor = makeShip('anchor');
        anchor.turnSpeed = 90;
        const rider = makeAsteroid('rider', 100, 0);
        spaceMgr.insertBulk([anchor, rider]);
        spaceMgr.forceFlushEntities();
        spaceMgr.attach('rider', 'anchor');
        tick(spaceMgr);
        // rider stays at distance 100 but rotated a quarter turn around the anchor
        const distance = XY.lengthOf(XY.difference(rider.position, anchor.position));
        expect(distance).to.be.closeTo(100, 1);
        expect(Math.abs(rider.position.y)).to.be.closeTo(100, 1);
        expect(rider.position.x).to.be.closeTo(anchor.position.x, 1);
        expect(rider.angle).to.be.closeTo(90, 1);
    });

    it('moveCommands move the whole attached clique', () => {
        const spaceMgr = new SpaceManager();
        const anchor = makeShip('anchor');
        const rider = makeAsteroid('rider', 0, 100);
        spaceMgr.insertBulk([anchor, rider]);
        spaceMgr.forceFlushEntities();
        spaceMgr.attach('rider', 'anchor');
        tick(spaceMgr, 0.01); // compute attachment cliques
        spaceMgr.state.moveCommands.push({ ids: ['anchor'], delta: { x: 42, y: 0 } });
        tick(spaceMgr, 0.01);
        expect(anchor.position.x).to.be.closeTo(42, 1);
        expect(rider.position.x).to.be.closeTo(42, 1);
    });

    it('detach inherits the clique velocity and stops following', () => {
        const spaceMgr = new SpaceManager();
        const anchor = makeShip('anchor');
        anchor.velocity.x = 100;
        const rider = makeAsteroid('rider', 0, 100);
        spaceMgr.insertBulk([anchor, rider]);
        spaceMgr.forceFlushEntities();
        spaceMgr.attach('rider', 'anchor');
        tick(spaceMgr); // compute cliques, move together
        spaceMgr.detach('rider');
        expect(rider.velocity.x).to.be.closeTo(100, 1);
        // rider no longer follows the anchor sideways
        anchor.velocity.x = 0;
        anchor.velocity.y = 100;
        const riderY = rider.position.y;
        tick(spaceMgr);
        expect(rider.position.y).to.be.closeTo(riderY, 1);
    });
});

describe('SpaceManager faction tracking', () => {
    function trackingSetup() {
        const spaceMgr = new SpaceManager();
        const scanner1 = makeShip('scanner-1', 0, 0, Faction.Gravitas);
        setOmniRadarSector(scanner1, 5000);
        const scanner2 = makeShip('scanner-2', 100, 0, Faction.Gravitas);
        setOmniRadarSector(scanner2, 5000);
        const target = makeShip('target', 1000, 0, Faction.Raiders);
        spaceMgr.insertBulk([scanner1, scanner2, target]);
        spaceMgr.forceFlushEntities();
        return { spaceMgr, scanner1, scanner2, target };
    }

    it('setTrack registers and unregisters a target for the faction', () => {
        const { spaceMgr } = trackingSetup();
        spaceMgr.setTrack('scanner-1', Faction.Gravitas, 'target', true);
        expect(spaceMgr.isTrackedByFaction('target', Faction.Gravitas)).to.equal(true);
        expect(spaceMgr.isTrackedByFaction('target', Faction.Raiders)).to.equal(false);
        spaceMgr.setTrack('scanner-1', Faction.Gravitas, 'target', false);
        expect(spaceMgr.isTrackedByFaction('target', Faction.Gravitas)).to.equal(false);
    });

    it('target stays tracked while at least one scanner of the faction still tracks it', () => {
        const { spaceMgr } = trackingSetup();
        spaceMgr.setTrack('scanner-1', Faction.Gravitas, 'target', true);
        spaceMgr.setTrack('scanner-2', Faction.Gravitas, 'target', true);
        spaceMgr.setTrack('scanner-1', Faction.Gravitas, 'target', false);
        expect(spaceMgr.isTrackedByFaction('target', Faction.Gravitas)).to.equal(true);
        spaceMgr.setTrack('scanner-2', Faction.Gravitas, 'target', false);
        expect(spaceMgr.isTrackedByFaction('target', Faction.Gravitas)).to.equal(false);
    });

    it('clearTracksForTarget removes the target from all tracking', () => {
        const { spaceMgr } = trackingSetup();
        spaceMgr.setTrack('scanner-1', Faction.Gravitas, 'target', true);
        spaceMgr.clearTracksForTarget('target');
        expect(spaceMgr.isTrackedByFaction('target', Faction.Gravitas)).to.equal(false);
    });

    it('destroying the target clears tracking on the next update', () => {
        const { spaceMgr } = trackingSetup();
        spaceMgr.setTrack('scanner-1', Faction.Gravitas, 'target', true);
        spaceMgr.destroyObject('target');
        tick(spaceMgr, 0.01);
        expect(spaceMgr.isTrackedByFaction('target', Faction.Gravitas)).to.equal(false);
    });

    it('tracked targets are visible to the tracking faction', () => {
        const { spaceMgr, target } = trackingSetup();
        // target is far outside every Gravitas radar range
        target.position.x = 1_000_000;
        spaceMgr.setTrack('scanner-1', Faction.Gravitas, 'target', true);
        const visible = spaceMgr.getFactionVisibleObjects(Faction.Gravitas);
        expect(visible.has(target)).to.equal(true);
    });

    it('tracking does not bypass radar range in canScan', () => {
        const { spaceMgr, target } = trackingSetup();
        target.position.x = 8000; // outside scanner-1 radar range (5000)
        spaceMgr.setTrack('scanner-1', Faction.Gravitas, 'target', true);
        expect(spaceMgr.canScan('scanner-1', 'target')).to.equal(false);
    });

    it('setScanLevel ignores invalid faction indexes', () => {
        const { spaceMgr } = trackingSetup();
        spaceMgr.setScanLevel('target', Faction.NONE, ScanLevel.ADVANCED);
        expect(spaceMgr.getScanLevel('target', Faction.NONE)).to.equal(ScanLevel.UFO);
    });
});

describe('SpaceManager damage resolution', () => {
    it('resolveObjectDamage yields collision damage exactly once', () => {
        const spaceMgr = new SpaceManager();
        const ship = makeShip('ship');
        const rock = makeAsteroid('rock', Spaceship.radius, 0, Spaceship.radius);
        spaceMgr.insertBulk([ship, rock]);
        spaceMgr.forceFlushEntities();
        tick(spaceMgr, 0.05); // overlapping circles collide immediately
        const damage = [...spaceMgr.resolveObjectDamage('ship')];
        expect(damage.length).to.be.greaterThan(0);
        expect(damage[0].amount).to.be.greaterThan(0);
        expect([...spaceMgr.resolveObjectDamage('ship')]).to.have.lengthOf(0);
    });

    it('changeShipRadarSectors updates live ships and ignores unknown ids', () => {
        const spaceMgr = new SpaceManager();
        const ship = makeShip('ship');
        spaceMgr.insert(ship);
        spaceMgr.forceFlushEntities();
        const sectors = [
            { direction: 0, arc: 360, range: 1234 },
            { direction: 90, arc: 30, range: 900 },
        ];
        spaceMgr.changeShipRadarSectors('ship', sectors);
        expect(ship.radarRange).to.equal(1234);
        expect(() => spaceMgr.changeShipRadarSectors('ghost', sectors)).to.not.throw();
    });
});
