/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
    Armor,
    Asteroid,
    Explosion,
    Projectile,
    REAR_ARC,
    ShipDie,
    ShipManagerNpc,
    ShipManagerPc,
    SpaceObject,
    Spaceship,
    Tuple2,
    Vec2,
    XY,
    calcShellSecondsToLive,
    concatinateArchs,
} from '../src';

import { SpaceSimulator } from './simulator';
import { expect } from 'chai';
import fc from 'fast-check';
import { float } from './properties';
import { switchToAvailableAmmo } from '../src/ship/chain-gun-manager';

function calcCollider(timeInSeconds: number, target: SpaceObject, speed: number) {
    const hitAngle = 0;
    const velocity = XY.byLengthAndDirection(speed, hitAngle);
    const position = XY.sum(
        target.position,
        XY.byLengthAndDirection(timeInSeconds * speed + target.radius, 180 - hitAngle),
    );
    return { velocity, position };
}

function* getHitPlatesArch(armor: Armor, range: Tuple2) {
    const degreesPerPlate = armor.degreesPerPlate;
    for (const [i, plate] of armor.platesInRange(range)) {
        if (plate.health < armor.design.plateMaxHealth) {
            const start = i * degreesPerPlate;
            yield [start, start + degreesPerPlate] as const;
        }
    }
}

const bulletSpeed = 1000;
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
                    const shell = new Projectile();
                    shell._explosion = explosion;
                    const { velocity, position } = calcCollider(timeInSeconds, target, bulletSpeed);
                    shell.velocity = Vec2.make(velocity);
                    shell.secondsToLive = timeInSeconds * 3; // enough time to collide
                    shell.init('shell', Vec2.make(position));
                    const { iterationTimeInSeconds } = new SpaceSimulator(numIterationsPerSecond)
                        .withObjects(target, shell)
                        .simulateUntilCondition(() => explosionInit.mock.calls.length > 0, timeInSeconds);

                    const explosionCenter = explosionInit.mock.calls[0][1];
                    const distance = XY.lengthOf(XY.difference(explosionCenter, target.position));
                    expect(distance).to.be.closeTo(target.radius, bulletSpeed * iterationTimeInSeconds * 2);
                    expect(distance).to.be.gte(target.radius);
                },
            ),
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
                    const { velocity, position } = calcCollider(timeInSeconds, target, bulletSpeed);
                    collider.velocity = Vec2.make(velocity);
                    collider.init('collider', Vec2.make(position));

                    new SpaceSimulator(numIterationsPerSecond)
                        .withObjects(target, collider)
                        .simulateUntilCondition(() => target.health !== initialHealth, timeInSeconds);
                },
            ),
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
                    const { velocity, position } = calcCollider(timeInSeconds, target, bulletSpeed);
                    collider.velocity = Vec2.make(velocity);
                    collider.init('collider', Vec2.make(position));

                    new SpaceSimulator(numIterationsPerSecond)
                        .withObjects(target, collider)
                        .simulateUntilCondition(
                            (spaceMgr) => [...spaceMgr.resolveObjectDamage(target.id)].length > 0,
                            timeInSeconds,
                        );
                },
            ),
        );
    });

    describe.each([ShipManagerPc, ShipManagerNpc])(
        `%p in high speed (up to ${bulletSpeed} m/s )`,
        (shipManagerCtor) => {
            function highSpeedShip(numIterationsPerSecond: number, speed: number) {
                const sim = new SpaceSimulator(numIterationsPerSecond);
                const ship = new Spaceship();
                ship.id = 'ship';
                const shipMgr = sim.withShip(ship, new ShipDie(0), shipManagerCtor);
                shipMgr.state.velocity = ship.velocity = Vec2.make(XY.byLengthAndDirection(speed, ship.angle));
                shipMgr.state.chainGun!.design.maxShellRange = 10_000;
                shipMgr.state.chainGun!.shellRange = 1;
                shipMgr.state.chainGun!.loading = 1;
                shipMgr.state.chainGun!.loadedProjectile = 'CannonShell';
                shipMgr.state.chainGun!.isFiring = true;
                switchToAvailableAmmo(shipMgr.state.chainGun!, shipMgr.state.magazine);

                // stop simulation when first bullet reaches its range
                const shellSecondsToLive = calcShellSecondsToLive(
                    shipMgr.state,
                    shipMgr.state.chainGun!,
                    shipMgr.state.chainGun!.design.maxShellRange,
                );
                return { sim, shellSecondsToLive, ship, shipMgr };
            }

            it.skip('does not shoot itself in the back when accelerating (regression)', () => {
                const speed = bulletSpeed;
                const numIterationsPerSecond = 20;
                const { sim, shellSecondsToLive, shipMgr } = highSpeedShip(numIterationsPerSecond, speed);
                shipMgr.state.smartPilot.maneuvering.x = 1; // fly forward
                shipMgr.state.afterBurnerCommand = 1; // afterburner

                shipMgr.state.armor.design.healRate = 0;

                sim.simulateUntilTime(shellSecondsToLive * 10, (_spaceMgr) => {
                    shipMgr.state.maneuvering.afterBurnerFuel = shipMgr.state.maneuvering.design.maxAfterBurnerFuel;
                });
                const hitArchs = [...concatinateArchs(getHitPlatesArch(shipMgr.state.armor, REAR_ARC))];
                expect(hitArchs).to.eql([]);
            });
        },
    );
});
