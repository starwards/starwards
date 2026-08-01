import { Projectile, SpaceManager, Spaceship, Vec2, XY, ammoDesigns } from '../src';

import { expect } from 'chai';

// Regression coverage for issue #2022: pause must freeze physics (deltaSeconds === 0),
// not skip the tick entirely. A deltaSeconds-0 tick must not divide by zero on solid
// collisions, must not apply per-tick collision damage, and must not let a proximity
// fuze detonate while frozen.

function tick(spaceMgr: SpaceManager, deltaSeconds: number) {
    spaceMgr.update({ deltaSeconds, deltaSecondsAvg: deltaSeconds, totalSeconds: 0 });
}

function makeShip(id: string, x = 0, y = 0) {
    const ship = new Spaceship();
    ship.id = id;
    ship.radius = Spaceship.radius;
    ship.position.x = x;
    ship.position.y = y;
    return ship;
}

describe('SpaceManager frozen at deltaSeconds=0 (paused)', () => {
    it('leaves overlapping ships and a projectile inside its proximity range fully unchanged across many paused ticks', () => {
        const spaceMgr = new SpaceManager();
        const shipA = makeShip('ship-a', 0, 0);
        const shipB = makeShip('ship-b', shipA.radius, 0); // hulls overlap
        shipB.velocity = Vec2.make({ x: 5, y: 0 });

        const fuzeRange = ammoDesigns.FragShell.fuze.type === 'proximity' ? ammoDesigns.FragShell.fuze.range : 0;
        const shell = new Projectile('FragShell');
        shell.init('proximity-shell', Vec2.make({ x: shipA.radius + fuzeRange / 2, y: 500 }));
        shell.secondsToLive = 100;

        spaceMgr.insertBulk([shipA, shipB, shell]);
        spaceMgr.forceFlushEntities();
        // one non-zero tick to settle field-of-view/collision bookkeeping before snapshotting,
        // then drain whatever damage that warm-up tick queued so the baseline starts empty
        tick(spaceMgr, 0.001);
        void [...spaceMgr.resolveObjectDamage(shipA.id)];
        void [...spaceMgr.resolveObjectDamage(shipB.id)];

        const snapshot = () => ({
            aPos: { ...shipA.position },
            bPos: { ...shipB.position },
            aVel: { ...shipA.velocity },
            bVel: { ...shipB.velocity },
            shellDestroyed: shell.destroyed,
            explosionCount: [...spaceMgr.state.getAll('Explosion')].length,
        });
        const before = snapshot();

        for (let i = 0; i < 50; i++) {
            tick(spaceMgr, 0);
        }

        expect(snapshot()).to.deep.equal(before);
        expect([...spaceMgr.resolveObjectDamage(shipA.id)]).to.have.lengthOf(0);
        expect([...spaceMgr.resolveObjectDamage(shipB.id)]).to.have.lengthOf(0);
        expect(XY.isZero(before.bVel, 0)).to.equal(false); // sanity: the moving ship really had velocity
    });
});
