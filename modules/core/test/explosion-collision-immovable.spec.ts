import { Explosion, SpaceManager, Spaceship, Vec2, XY } from '../src';

import { expect } from 'chai';

describe('Explosion collision response — immovable blast (issue #2150 rework)', () => {
    it("never mutates the explosion's own position or velocity — only the hull it strikes", () => {
        const spaceManager = new SpaceManager();

        const ship = new Spaceship();
        ship.id = 'target-ship';
        ship.radius = 200; // large enough to fully engulf the small blast below
        ship.position = Vec2.make({ x: 0, y: 0 });
        ship.velocity = Vec2.make({ x: 0, y: 0 });

        const explosion = new Explosion().init('blast', Vec2.make({ x: 0, y: 0 }), 50);
        explosion.radius = 20; // fully inside the ship's hull — triggers the old aInB branch
        explosion.expansionSpeed = 0; // keep the overlap geometry stable across ticks
        explosion.secondsToLive = 10;
        explosion.velocity = Vec2.make({ x: 5, y: 0 }); // a drifting blast, undisturbed by collision

        spaceManager.insertBulk([ship, explosion]);
        spaceManager.forceFlushEntities();

        for (let i = 0; i < 5; i++) {
            spaceManager.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 * (i + 1) });
        }

        expect(explosion.velocity.x).to.equal(5);
        expect(explosion.velocity.y).to.equal(0);
        // the hull, not the blast, absorbs the collision — it took an impulse from the overlap
        expect(XY.isZero(ship.velocity, 0.0001)).to.equal(false);
    });
});
