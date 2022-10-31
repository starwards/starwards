/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
    EPSILON,
    Explosion,
    ShipManager,
    SmartPilotMode,
    SpaceManager,
    Spaceship,
    Vec2,
    XY,
    limitPercisionHard,
    makeShipState,
    padArch,
    shipConfigurations,
} from '../src';

import { MockDie } from './ship-test-harness';
import { ProjectileModel } from '../src/configurations/projectiles';
import { expect } from 'chai';
import fc from 'fast-check';
import { float } from './properties';

const dragonflyConfig = shipConfigurations['dragonfly-SF22'];

describe('ShipManager', () => {
    it('explosion must damage only affected areas', () => {
        fc.assert(
            // TODO explosionAngleToShip should also be a property
            fc.property(fc.integer({ min: 15, max: 20 }), (numIterationsPerSecond: number) => {
                const explosionAngleToShip = 180;
                const iterationTimeInSeconds = 1 / numIterationsPerSecond;
                const spaceMgr = new SpaceManager();
                const shipObj = new Spaceship();
                shipObj.id = '1';
                const die = new MockDie();
                const shipMgr = new ShipManager(shipObj, makeShipState(shipObj.id, dragonflyConfig), spaceMgr, die);
                die.expectedRoll = 1;
                spaceMgr.insert(shipObj);
                shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
                shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
                const explosion = new Explosion();
                const sizeOfPlate = (2 * Math.PI * shipObj.radius) / shipMgr.state.armor.numberOfPlates;
                explosion.expansionSpeed = sizeOfPlate / explosion.secondsToLive; // expand to size of a plate
                explosion.damageFactor = Number.MAX_SAFE_INTEGER;
                explosion.position = Vec2.sum(
                    shipObj.position,
                    XY.byLengthAndDirection(shipObj.radius, explosionAngleToShip)
                );
                spaceMgr.insert(explosion);

                while (!explosion.destroyed) {
                    shipMgr.update(iterationTimeInSeconds);
                    spaceMgr.update(iterationTimeInSeconds);
                }

                const expectedHitPlatesRange = padArch(
                    [explosionAngleToShip, explosionAngleToShip],
                    sizeOfPlate + EPSILON
                );
                const brokenOutsideExplosion = shipMgr.getNumberOfBrokenPlatesInRange([EPSILON, 360]);
                expect(brokenOutsideExplosion).to.equal(2);

                const brokenInsideExplosion = shipMgr.getNumberOfBrokenPlatesInRange(expectedHitPlatesRange);
                expect(brokenInsideExplosion).to.equal(2);
                expect(shipMgr.state.chainGun!.broken).to.be.false;
                expect(shipMgr.state.chainGun!.angleOffset).to.equal(0);
                expect(shipMgr.state.chainGun!.rateOfFireFactor).to.equal(1);
            })
        );
    });

    it('chaingun must expend ammo', () => {
        fc.assert(
            fc.property(fc.integer({ min: 15, max: 20 }), (numIterationsPerSecond: number) => {
                const iterationTimeInSeconds = 1 / numIterationsPerSecond;
                const spaceMgr = new SpaceManager();
                const shipObj = new Spaceship();
                shipObj.id = '1';
                const shipMgr = new ShipManager(
                    shipObj,
                    makeShipState(shipObj.id, dragonflyConfig),
                    spaceMgr,
                    new MockDie()
                );
                spaceMgr.insert(shipObj);
                shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
                shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
                shipMgr.state.chainGun!.isFiring = true;
                shipMgr.state.chainGun!.projectile = ProjectileModel.CannonShell;
                let timePassed = 0;
                while (timePassed <= 1) {
                    shipMgr.update(iterationTimeInSeconds);
                    spaceMgr.update(iterationTimeInSeconds);
                    timePassed += iterationTimeInSeconds;
                }
                const cannonShells = [...spaceMgr.state.getAll('CannonShell')];
                expect(cannonShells.length).to.be.closeTo(
                    Math.min(numIterationsPerSecond, shipMgr.state.chainGun!.design.bulletsPerSecond),
                    1
                );
                expect(shipMgr.state.magazine.cannonShells).to.equal(
                    shipMgr.state.magazine.design.maxCannonShells - cannonShells.length
                );
            })
        );
    });

    it('chaingun must not fire without ammo', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 15, max: 20 }),
                fc.integer({ min: 0, max: 10 }),
                (numIterationsPerSecond: number, availableAmmo: number) => {
                    const iterationTimeInSeconds = 1 / numIterationsPerSecond;
                    const spaceMgr = new SpaceManager();
                    const shipObj = new Spaceship();
                    shipObj.id = '1';
                    const shipMgr = new ShipManager(
                        shipObj,
                        makeShipState(shipObj.id, dragonflyConfig),
                        spaceMgr,
                        new MockDie()
                    );
                    spaceMgr.insert(shipObj);
                    shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
                    shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
                    shipMgr.state.chainGun!.rateOfFireFactor = 1;
                    shipMgr.state.magazine.cannonShells = availableAmmo;
                    shipMgr.state.chainGun!.isFiring = true;
                    shipMgr.state.chainGun!.projectile = ProjectileModel.CannonShell;
                    let timePassed = 0;
                    while (timePassed <= 1) {
                        shipMgr.update(iterationTimeInSeconds);
                        spaceMgr.update(iterationTimeInSeconds);
                        timePassed += iterationTimeInSeconds;
                    }
                    const cannonShells = [...spaceMgr.state.getAll('CannonShell')];
                    expect(cannonShells.length).to.equal(availableAmmo);
                    expect(shipMgr.state.magazine.cannonShells).to.equal(0);
                }
            )
        );
    });

    it('chaingun with attitude damage must fire at an offset', () => {
        fc.assert(
            fc.property(
                float(1, 180),
                fc.integer({ min: 15, max: 20 }),
                (angleOffset: number, numIterationsPerSecond: number) => {
                    const iterationTimeInSeconds = 1 / numIterationsPerSecond;
                    const spaceMgr = new SpaceManager();
                    const shipObj = new Spaceship();
                    shipObj.id = '1';
                    const shipMgr = new ShipManager(
                        shipObj,
                        makeShipState(shipObj.id, dragonflyConfig),
                        spaceMgr,
                        new MockDie()
                    );
                    spaceMgr.insert(shipObj);
                    shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
                    shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
                    shipMgr.state.chainGun!.angleOffset = angleOffset;
                    shipMgr.state.chainGun!.design.bulletDegreesDeviation = 0;
                    shipMgr.state.chainGun!.isFiring = true;
                    let timePassed = 0;
                    while (timePassed <= 1) {
                        shipMgr.update(iterationTimeInSeconds);
                        spaceMgr.update(iterationTimeInSeconds);
                        timePassed += iterationTimeInSeconds;
                    }

                    for (const cannonShell of spaceMgr.state.getAll('CannonShell')) {
                        expect(limitPercisionHard(XY.angleOf(cannonShell.velocity))).to.equal(angleOffset);
                    }
                }
            )
        );
    });

    it('chaingun with cooling failure must have reduced rate of fire', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 15, max: 20 }),
                fc.integer({ min: 10, max: 20 }),
                (numIterationsPerSecond: number, bulletsPerSecond: number) => {
                    const iterationTimeInSeconds = 1 / numIterationsPerSecond;
                    const spaceMgr = new SpaceManager();
                    const shipObj = new Spaceship();
                    shipObj.id = '1';
                    const shipMgr = new ShipManager(
                        shipObj,
                        makeShipState(shipObj.id, dragonflyConfig),
                        spaceMgr,
                        new MockDie()
                    );
                    spaceMgr.insert(shipObj);
                    shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
                    shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
                    shipMgr.state.chainGun!.rateOfFireFactor = 0.5;
                    shipMgr.state.chainGun!.design.bulletsPerSecond = bulletsPerSecond;
                    shipMgr.state.chainGun!.isFiring = true;
                    shipMgr.state.chainGun!.projectile = ProjectileModel.CannonShell;
                    let timePassed = 0;
                    while (timePassed <= 1) {
                        shipMgr.update(iterationTimeInSeconds);
                        spaceMgr.update(iterationTimeInSeconds);
                        timePassed += iterationTimeInSeconds;
                    }
                    expect([...spaceMgr.state.getAll('CannonShell')].length).to.be.closeTo(
                        Math.floor(
                            shipMgr.state.chainGun!.design.bulletsPerSecond * shipMgr.state.chainGun!.rateOfFireFactor
                        ),
                        1
                    );
                }
            )
        );
    });
});
