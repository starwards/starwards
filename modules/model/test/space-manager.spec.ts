import {
    Asteroid,
    CannonShell,
    Explosion,
    SpaceManager,
    SpaceObject,
    Spaceship,
    Vec2,
    XY,
    limitPercision,
} from '../src';

import { expect } from 'chai';
import fc from 'fast-check';
import { float } from './properties';

function calcCollider(timeInSeconds: number, target: SpaceObject, speed: number) {
    const hitAngle = 0;
    const velocity = XY.byLengthAndDirection(speed, hitAngle);
    const position = XY.sum(
        target.position,
        XY.byLengthAndDirection(timeInSeconds * speed + target.radius, 180 - hitAngle)
    );
    return { velocity, position };
}

class SpaceSimulator {
    public spaceMgr = new SpaceManager();
    constructor(private timeInSeconds: number, private numIterationsPerSecond: number) {}
    get iterationTimeInSeconds() {
        return limitPercision(1 / this.numIterationsPerSecond);
    }
    withObjects(...objects: SpaceObject[]) {
        this.spaceMgr.insertBulk(objects);
        return this;
    }
    simulateUntilCondition(predicate: (spaceMgr: SpaceManager) => boolean) {
        let timePassed = 0;
        const timeRemainder = Math.abs(
            this.timeInSeconds - this.timeInSeconds * this.iterationTimeInSeconds * this.numIterationsPerSecond
        );
        const timeRange = this.iterationTimeInSeconds * 1.5 + timeRemainder;
        while (!predicate(this.spaceMgr)) {
            this.spaceMgr.update(this.iterationTimeInSeconds);
            timePassed += this.iterationTimeInSeconds;
        }
        expect(timePassed).to.be.closeTo(this.timeInSeconds, timeRange);
        return this;
    }
}
const speed = 1000;
describe('SpaceManager', () => {
    it('upon collision, shell explodes on surface of object (not inside)', () => {
        fc.assert(
            fc.property(
                float(1, 5),
                fc.integer({ min: 15, max: 20 }),
                (timeInSeconds: number, numIterationsPerSecond: number) => {
                    const target = new Asteroid();
                    target.radius = Spaceship.radius;
                    const explosion = new Explosion();
                    const explosionInit = jest.spyOn(explosion, 'init');
                    const shell = new CannonShell(explosion);
                    const { velocity, position } = calcCollider(timeInSeconds, target, speed);
                    shell.velocity = Vec2.make(velocity);
                    shell.secondsToLive = timeInSeconds * 3; // enough time to collide
                    shell.init('shell', Vec2.make(position));
                    const { iterationTimeInSeconds } = new SpaceSimulator(timeInSeconds, numIterationsPerSecond)
                        .withObjects(target, shell)
                        .simulateUntilCondition(() => explosionInit.mock.calls.length > 0);

                    const explosionCenter = explosionInit.mock.calls[0][1];
                    const distance = XY.lengthOf(XY.difference(explosionCenter, target.position));
                    expect(distance).to.be.closeTo(target.radius + shell.radius, speed * iterationTimeInSeconds * 2);
                    expect(distance).to.be.gte(target.radius + shell.radius);
                }
            )
        );
    });
    it('upon collision, target takes damage', () => {
        fc.assert(
            fc.property(
                float(1, 5),
                fc.integer({ min: 15, max: 20 }),
                (timeInSeconds: number, numIterationsPerSecond: number) => {
                    const target = new Asteroid();
                    const initialHealth = target.health;
                    target.radius = Spaceship.radius;
                    const collider = new Asteroid();
                    collider.radius = Spaceship.radius;
                    const { velocity, position } = calcCollider(timeInSeconds, target, speed);
                    collider.velocity = Vec2.make(velocity);
                    collider.init('collider', Vec2.make(position));

                    new SpaceSimulator(timeInSeconds, numIterationsPerSecond)
                        .withObjects(target, collider)
                        .simulateUntilCondition(() => target.health !== initialHealth);
                }
            )
        );
    });
    it('upon collision, ship takes damage', () => {
        fc.assert(
            fc.property(
                float(1, 5),
                fc.integer({ min: 15, max: 20 }),
                (timeInSeconds: number, numIterationsPerSecond: number) => {
                    const target = new Spaceship();
                    const collider = new Asteroid();
                    collider.radius = Spaceship.radius;
                    const { velocity, position } = calcCollider(timeInSeconds, target, speed);
                    collider.velocity = Vec2.make(velocity);
                    collider.init('collider', Vec2.make(position));

                    new SpaceSimulator(timeInSeconds, numIterationsPerSecond)
                        .withObjects(target, collider)
                        .simulateUntilCondition((spaceMgr) => [...spaceMgr.resolveObjectDamage(target)].length > 0);
                }
            )
        );
    });
});
