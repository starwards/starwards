/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
    Asteroid,
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
import { degree, float } from './properties';

import { DockingMode } from '../src/ship/docking';
import { MockDie } from './ship-test-harness';
import { expect } from 'chai';
import fc from 'fast-check';
import { switchToAvailableAmmo } from '../src/ship/chain-gun-manager';

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
                    XY.byLengthAndDirection(shipObj.radius, explosionAngleToShip),
                );
                spaceMgr.insert(explosion);

                while (!explosion.destroyed) {
                    shipMgr.update(iterationTimeInSeconds);
                    spaceMgr.update(iterationTimeInSeconds);
                }

                const expectedHitPlatesRange = padArch(
                    [explosionAngleToShip, explosionAngleToShip],
                    sizeOfPlate + EPSILON,
                );
                //@ts-ignore : access private property
                const brokenOutsideExplosion = shipMgr.damageManager.getNumberOfBrokenPlatesInRange([EPSILON, 360]);
                expect(brokenOutsideExplosion).to.equal(2);

                const brokenInsideExplosion =
                    //@ts-ignore : access private property
                    shipMgr.damageManager.getNumberOfBrokenPlatesInRange(expectedHitPlatesRange);
                expect(brokenInsideExplosion).to.equal(2);
                expect(shipMgr.state.chainGun!.broken).to.be.false;
                expect(shipMgr.state.chainGun!.angleOffset).to.equal(0);
                expect(shipMgr.state.chainGun!.rateOfFireFactor).to.equal(1);
            }),
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
                    new MockDie(),
                );
                spaceMgr.insert(shipObj);
                shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
                shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
                shipMgr.state.chainGun!.isFiring = true;
                switchToAvailableAmmo(shipMgr.state.chainGun!, shipMgr.state.magazine);

                let timePassed = 0;
                while (timePassed <= 1) {
                    shipMgr.update(iterationTimeInSeconds);
                    spaceMgr.update(iterationTimeInSeconds);
                    timePassed += iterationTimeInSeconds;
                }
                const cannonShells = [...spaceMgr.state.getAll('Projectile')];
                expect(cannonShells.length).to.be.closeTo(
                    Math.min(numIterationsPerSecond, shipMgr.state.chainGun!.design.bulletsPerSecond),
                    1,
                );
                expect(shipMgr.state.magazine.count_CannonShell).to.equal(
                    shipMgr.state.magazine.design.max_CannonShell - cannonShells.length,
                );
            }),
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
                        new MockDie(),
                    );
                    spaceMgr.insert(shipObj);
                    shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
                    shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
                    shipMgr.state.chainGun!.rateOfFireFactor = 1;
                    shipMgr.state.chainGun!.design.use_BlastCannonShell = false;
                    shipMgr.state.chainGun!.design.use_Missile = false;
                    shipMgr.state.chainGun!.design.use_CannonShell = true;
                    shipMgr.state.magazine.count_CannonShell = availableAmmo;
                    shipMgr.state.chainGun!.projectile = 'CannonShell';
                    shipMgr.state.chainGun!.isFiring = true;
                    switchToAvailableAmmo(shipMgr.state.chainGun!, shipMgr.state.magazine);

                    let timePassed = 0;
                    while (timePassed <= 1) {
                        shipMgr.update(iterationTimeInSeconds);
                        spaceMgr.update(iterationTimeInSeconds);
                        timePassed += iterationTimeInSeconds;
                    }
                    const cannonShells = [...spaceMgr.state.getAll('Projectile')];
                    expect(cannonShells.length).to.equal(availableAmmo);
                    expect(shipMgr.state.magazine.count_CannonShell).to.equal(0);
                },
            ),
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
                        new MockDie(),
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

                    for (const cannonShell of spaceMgr.state.getAll('Projectile')) {
                        expect(limitPercisionHard(XY.angleOf(cannonShell.velocity))).to.equal(angleOffset);
                    }
                },
            ),
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
                        new MockDie(),
                    );
                    spaceMgr.insert(shipObj);
                    shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
                    shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
                    shipMgr.state.chainGun!.rateOfFireFactor = 0.5;
                    shipMgr.state.chainGun!.design.bulletsPerSecond = bulletsPerSecond;
                    shipMgr.state.chainGun!.isFiring = true;
                    switchToAvailableAmmo(shipMgr.state.chainGun!, shipMgr.state.magazine);

                    let timePassed = 0;
                    while (timePassed <= 1) {
                        shipMgr.update(iterationTimeInSeconds);
                        spaceMgr.update(iterationTimeInSeconds);
                        timePassed += iterationTimeInSeconds;
                    }
                    expect([...spaceMgr.state.getAll('Projectile')].length).to.be.closeTo(
                        Math.floor(
                            shipMgr.state.chainGun!.design.bulletsPerSecond * shipMgr.state.chainGun!.rateOfFireFactor,
                        ),
                        1,
                    );
                },
            ),
        );
    });

    it('ship can dock', () => {
        fc.assert(
            fc.property(float(0, 2_000), degree(), degree(), (distance: number, angle: number, rotation: number) => {
                const iterationTimeInSeconds = 1 / 20;
                const distanceGrace = 1_000;
                const targetRadius = 100;
                const spaceMgr = new SpaceManager();
                const shipObj = new Spaceship();
                shipObj.id = 'ship';
                shipObj.angle = rotation;
                const shipMgr = new ShipManager(
                    shipObj,
                    makeShipState(shipObj.id, dragonflyConfig),
                    spaceMgr,
                    new MockDie(),
                );
                shipObj.position = Vec2.make(
                    XY.byLengthAndDirection(
                        distance + targetRadius + shipObj.radius + shipMgr.state.docking.maxDockedDistance,
                        angle,
                    ),
                );
                spaceMgr.insert(shipObj);
                const asteroid = new Asteroid().init('asteroid', new Vec2(0, 0), targetRadius);
                spaceMgr.insert(asteroid);
                shipMgr.state.docking.design.maxDockingDistance =
                    distance + shipMgr.state.docking.maxDockedDistance + distanceGrace;
                shipMgr.state.docking.targetId = asteroid.id;
                shipMgr.state.docking.mode = DockingMode.DOCKING as DockingMode;
                const maxTime = (60 * 60) / iterationTimeInSeconds;
                let counter = 0;
                while (counter < maxTime && shipMgr.state.docking.mode === DockingMode.DOCKING) {
                    spaceMgr.update(iterationTimeInSeconds);
                    shipMgr.update(iterationTimeInSeconds);
                    counter++;
                }
                expect(shipMgr.state.docking.mode).to.eql(DockingMode.DOCKED);
            }),
        );
    });
});
