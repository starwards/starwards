import { Asteroid, CannonShell, Explosion, SpaceManager, Spaceship, Vec2, XY, limitPercision } from '../src';

import { expect } from 'chai';
import fc from 'fast-check';
import { float } from './properties';

describe('SpaceManager', () => {
    it('upon collision, shell explodes on surface of object (not inside)', () => {
        fc.assert(
            fc.property(
                float(1, 5),
                fc.integer({ min: 15, max: 20 }),
                (timeInSeconds: number, numIterationsPerSecond: number) => {
                    const shellSpeed = 1000;
                    const iterationTimeInSeconds = limitPercision(1 / numIterationsPerSecond);
                    const spaceMgr = new SpaceManager();
                    const asteroid = new Asteroid();
                    asteroid.radius = Spaceship.radius;
                    spaceMgr.insert(asteroid);
                    const explosion = new Explosion();
                    const explosionInit = jest.spyOn(explosion, 'init');
                    const shell = new CannonShell(explosion);
                    shell.velocity = Vec2.make(XY.byLengthAndDirection(shellSpeed, shell.angle));
                    const shellPosition = Vec2.sum(
                        asteroid.position,
                        XY.byLengthAndDirection(timeInSeconds * shellSpeed + asteroid.radius, 180 - shell.angle)
                    );
                    shell.secondsToLive = timeInSeconds * 3; // enough time to collide
                    shell.init('shell', shellPosition);
                    spaceMgr.insert(shell);

                    let timePassed = 0;
                    const timeReminder = Math.abs(
                        timeInSeconds - timeInSeconds * iterationTimeInSeconds * numIterationsPerSecond
                    );
                    while (!explosionInit.mock.calls.length) {
                        spaceMgr.update(iterationTimeInSeconds);
                        timePassed += iterationTimeInSeconds;
                    }
                    expect(timePassed).to.be.closeTo(timeInSeconds, iterationTimeInSeconds * 1.5 + timeReminder);

                    const explosionCenter = explosionInit.mock.calls[0][1];
                    const distance = XY.lengthOf(XY.difference(explosionCenter, asteroid.position));
                    expect(distance).to.be.closeTo(
                        asteroid.radius + shell.radius,
                        shellSpeed * iterationTimeInSeconds * 2
                    );
                    expect(distance).to.be.gte(asteroid.radius + shell.radius);
                }
            )
        );
    });
    it('upon collision, asteroid takes damage', () => {
        fc.assert(
            fc.property(
                float(1, 5),
                fc.integer({ min: 15, max: 20 }),
                (timeInSeconds: number, numIterationsPerSecond: number) => {
                    const speed = 1000;
                    const iterationTimeInSeconds = limitPercision(1 / numIterationsPerSecond);
                    const spaceMgr = new SpaceManager();
                    const asteroid = new Asteroid();
                    const initialHealth = asteroid.health;
                    asteroid.radius = Spaceship.radius;
                    spaceMgr.insert(asteroid);
                    const asteroid2 = new Asteroid();
                    asteroid2.radius = Spaceship.radius;
                    asteroid2.velocity = Vec2.make(XY.byLengthAndDirection(speed, asteroid2.angle));
                    const position = Vec2.sum(
                        asteroid.position,
                        XY.byLengthAndDirection(timeInSeconds * speed + asteroid.radius, 180 - asteroid2.angle)
                    );
                    asteroid2.init('asteroid2', position);
                    spaceMgr.insert(asteroid2);

                    let timePassed = 0;
                    const timeReminder = Math.abs(
                        timeInSeconds - timeInSeconds * iterationTimeInSeconds * numIterationsPerSecond
                    );
                    while (asteroid.health === initialHealth) {
                        spaceMgr.update(iterationTimeInSeconds);
                        timePassed += iterationTimeInSeconds;
                    }
                    expect(limitPercision(timePassed)).to.be.closeTo(
                        timeInSeconds,
                        iterationTimeInSeconds * 1.5 + timeReminder
                    );
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
                    const speed = 1000;
                    const iterationTimeInSeconds = limitPercision(1 / numIterationsPerSecond);
                    const spaceMgr = new SpaceManager();
                    const ship = new Spaceship();
                    spaceMgr.insert(ship);
                    const asteroid2 = new Asteroid();
                    asteroid2.radius = Spaceship.radius;
                    asteroid2.velocity = Vec2.make(XY.byLengthAndDirection(speed, asteroid2.angle));
                    const position = Vec2.sum(
                        ship.position,
                        XY.byLengthAndDirection(timeInSeconds * speed + ship.radius, 180 - asteroid2.angle)
                    );
                    asteroid2.init('asteroid2', position);
                    spaceMgr.insert(asteroid2);

                    let timePassed = 0;
                    const timeReminder = Math.abs(
                        timeInSeconds - timeInSeconds * iterationTimeInSeconds * numIterationsPerSecond
                    );
                    while ([...spaceMgr.resolveObjectDamage(ship)].length === 0) {
                        spaceMgr.update(iterationTimeInSeconds);
                        timePassed += iterationTimeInSeconds;
                    }
                    expect(limitPercision(timePassed)).to.be.closeTo(
                        timeInSeconds,
                        iterationTimeInSeconds * 1.5 + timeReminder
                    );
                }
            )
        );
    });
});
