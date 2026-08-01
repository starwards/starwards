import {
    Asteroid,
    EPSILON,
    Explosion,
    PowerLevel,
    RTuple2,
    ShipManagerNpc,
    ShipManagerPc,
    SmartPilotMode,
    SpaceManager,
    Spaceship,
    Vec2,
    XY,
    limitPercisionHard,
    makeShipState,
    padArch,
    shipConfigurations,
    toPositiveDegreesDelta,
} from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';
import { degree, float } from './properties';

import { DockingMode } from '../src/ship/docking';
import { ShipState } from '../src/ship/ship-state';
import { ammoDesigns } from '../src/space/projectile';
import { expect } from 'chai';
import fc from 'fast-check';
import { switchToAvailableAmmo } from '../src/ship/chain-gun-manager';

const dragonflyConfig = shipConfigurations['dragonfly-SF22'];

function countBrokenPlatesInRange(state: ShipState, hitRange: RTuple2): number {
    let broken = 0;
    for (const [, plate] of state.armor.platesInRange(hitRange)) {
        if (plate.broken) {
            broken++;
        }
    }
    return broken;
}

describe.each([ShipManagerPc, ShipManagerNpc])('%p', (shipManagerCtor) => {
    it('explosion must damage only affected areas', () => {
        fc.assert(
            fc.property(
                degree(),
                degree(),
                fc.integer({ min: 15, max: 20 }),
                (explosionAngleToShip: number, shipAngle: number, numIterationsPerSecond: number) => {
                    const spaceMgr = new SpaceManager();
                    const shipObj = new Spaceship();
                    shipObj.id = '1';
                    shipObj.angle = shipAngle;
                    const die = new MockDie();
                    const shipMgr = new shipManagerCtor(
                        shipObj,
                        makeShipState(shipObj.id, dragonflyConfig),
                        spaceMgr,
                        die,
                    );
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
                    const totalTime = explosion.secondsToLive * 2;
                    const i = makeIterationsData(
                        totalTime,
                        totalTime * numIterationsPerSecond,
                        () => explosion.destroyed,
                    );
                    for (const id of i) {
                        shipMgr.update(id);
                        spaceMgr.update(id);
                    }
                    // damage arc is expressed in ship-local frame; account for ship's world rotation
                    const explosionLocalAngle = toPositiveDegreesDelta(explosionAngleToShip - shipAngle);
                    const expectedHitPlatesRange = padArch(
                        [explosionLocalAngle, explosionLocalAngle],
                        sizeOfPlate + EPSILON,
                    );
                    const brokenTotal = countBrokenPlatesInRange(shipMgr.state, [EPSILON, 360]);
                    expect(brokenTotal).to.oneOf([2, 3]);

                    const brokenInsideExplosion = countBrokenPlatesInRange(shipMgr.state, expectedHitPlatesRange);
                    expect(brokenInsideExplosion).to.equal(brokenTotal);
                    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                    expect(shipMgr.state.chainGun!.broken).to.be.false;
                    expect(shipMgr.state.chainGun!.angleOffset).to.equal(0);
                    expect(shipMgr.state.chainGun!.rateOfFireFactor).to.equal(1);
                },
            ),
        );
    });

    it('chaingun must expend ammo', () => {
        fc.assert(
            fc.property(fc.integer({ min: 15, max: 20 }), (numIterationsPerSecond: number) => {
                const spaceMgr = new SpaceManager();
                const shipObj = new Spaceship();
                shipObj.id = '1';
                const shipMgr = new shipManagerCtor(
                    shipObj,
                    makeShipState(shipObj.id, dragonflyConfig),
                    spaceMgr,
                    new MockDie(),
                );
                spaceMgr.insert(shipObj);
                shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
                shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
                shipMgr.state.chainGun!.power = PowerLevel.MAX;
                shipMgr.state.chainGun!.isFiring = true;
                switchToAvailableAmmo(shipMgr.state.chainGun!, shipMgr.state.magazine);

                const i = makeIterationsData(1, numIterationsPerSecond);
                for (const id of i) {
                    shipMgr.update(id);
                    spaceMgr.update(id);
                }
                const cannonShells = [...spaceMgr.state.getAll('Projectile')];
                expect(cannonShells.length).to.be.closeTo(
                    Math.min(numIterationsPerSecond, shipMgr.state.chainGun!.design.bulletsPerSecond),
                    1,
                );
                expect(shipMgr.state.magazine.count_HiExpShell).to.equal(
                    shipMgr.state.magazine.design.max_HiExpShell - cannonShells.length,
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
                    const spaceMgr = new SpaceManager();
                    const shipObj = new Spaceship();
                    shipObj.id = '1';
                    const shipMgr = new shipManagerCtor(
                        shipObj,
                        makeShipState(shipObj.id, dragonflyConfig),
                        spaceMgr,
                        new MockDie(),
                    );
                    spaceMgr.insert(shipObj);
                    shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
                    shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
                    shipMgr.state.chainGun!.power = PowerLevel.MAX;
                    shipMgr.state.chainGun!.rateOfFireFactor = 1;
                    shipMgr.state.chainGun!.design.use_FragShell = false;
                    shipMgr.state.chainGun!.design.use_HiExpMissile = false;
                    shipMgr.state.chainGun!.design.use_HiExpShell = true;
                    shipMgr.state.magazine.count_HiExpShell = availableAmmo;
                    shipMgr.state.chainGun!.projectile = 'HiExpShell';
                    shipMgr.state.chainGun!.isFiring = true;
                    switchToAvailableAmmo(shipMgr.state.chainGun!, shipMgr.state.magazine);

                    const i = makeIterationsData(1, numIterationsPerSecond);
                    for (const id of i) {
                        shipMgr.update(id);
                        spaceMgr.update(id);
                    }
                    const cannonShells = [...spaceMgr.state.getAll('Projectile')];
                    expect(cannonShells.length).to.equal(availableAmmo);
                    expect(shipMgr.state.magazine.count_HiExpShell).to.equal(0);
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
                    const spaceMgr = new SpaceManager();
                    const shipObj = new Spaceship();
                    shipObj.id = '1';
                    const shipMgr = new shipManagerCtor(
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

                    const i = makeIterationsData(1, numIterationsPerSecond);
                    for (const id of i) {
                        shipMgr.update(id);
                        spaceMgr.update(id);
                    }

                    for (const cannonShell of spaceMgr.state.getAll('Projectile')) {
                        expect(limitPercisionHard(XY.angleOf(cannonShell.velocity))).to.equal(angleOffset);
                    }
                },
            ),
        );
    });

    it('chaingun must add heat when firing', () => {
        fc.assert(
            fc.property(fc.integer({ min: 15, max: 20 }), (numIterationsPerSecond: number) => {
                const spaceMgr = new SpaceManager();
                const shipObj = new Spaceship();
                shipObj.id = '1';
                const shipMgr = new shipManagerCtor(
                    shipObj,
                    makeShipState(shipObj.id, dragonflyConfig),
                    spaceMgr,
                    new MockDie(),
                );
                spaceMgr.insert(shipObj);
                shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
                shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
                shipMgr.state.chainGun!.power = PowerLevel.MAX;
                shipMgr.state.chainGun!.isFiring = true;
                // disable cooling and reactor heat to isolate weapon heat
                shipMgr.state.design.totalCoolant = 0;
                shipMgr.state.reactor.design.energyHeatEPMThreshold = Infinity;
                switchToAvailableAmmo(shipMgr.state.chainGun!, shipMgr.state.magazine);
                const heatPerShell = ammoDesigns.HiExpShell.heatPerShot;

                const i = makeIterationsData(1, numIterationsPerSecond);
                for (const id of i) {
                    shipMgr.update(id);
                    spaceMgr.update(id);
                }
                const shotsFired = [...spaceMgr.state.getAll('Projectile')].length;
                expect(shotsFired).to.be.greaterThan(0);
                expect(shipMgr.state.chainGun!.heat).to.be.closeTo(shotsFired * heatPerShell, heatPerShell);
            }),
        );
    });

    it('tube must add heat when firing', () => {
        const spaceMgr = new SpaceManager();
        const shipObj = new Spaceship();
        shipObj.id = '1';
        const shipMgr = new shipManagerCtor(
            shipObj,
            makeShipState(shipObj.id, dragonflyConfig),
            spaceMgr,
            new MockDie(),
        );
        spaceMgr.insert(shipObj);
        shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
        shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
        // disable cooling and reactor heat to isolate weapon heat
        shipMgr.state.design.totalCoolant = 0;
        shipMgr.state.reactor.design.energyHeatEPMThreshold = Infinity;
        // fire first tube only for 2 seconds so at least 1 missile fires (rate: 1/s)
        const tube = shipMgr.state.tubes[0];
        tube.power = PowerLevel.MAX;
        tube.isFiring = true;
        switchToAvailableAmmo(tube, shipMgr.state.magazine);
        const heatPerMissile = ammoDesigns.HiExpMissile.heatPerShot;

        const numIterationsPerSecond = 20;
        const i = makeIterationsData(2, numIterationsPerSecond * 2);
        for (const id of i) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }
        const projectiles = [...spaceMgr.state.getAll('Projectile')];
        expect(projectiles.length).to.be.greaterThan(0);
        expect(tube.heat).to.be.closeTo(projectiles.length * heatPerMissile, heatPerMissile);
    });

    it('chaingun with cooling failure must have reduced rate of fire', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 15, max: 20 }),
                fc.integer({ min: 10, max: 20 }),
                (numIterationsPerSecond: number, bulletsPerSecond: number) => {
                    const spaceMgr = new SpaceManager();
                    const shipObj = new Spaceship();
                    shipObj.id = '1';
                    const shipMgr = new shipManagerCtor(
                        shipObj,
                        makeShipState(shipObj.id, dragonflyConfig),
                        spaceMgr,
                        new MockDie(),
                    );
                    spaceMgr.insert(shipObj);
                    shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
                    shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
                    shipMgr.state.chainGun!.power = PowerLevel.MAX;
                    shipMgr.state.chainGun!.rateOfFireFactor = 0.5;
                    shipMgr.state.chainGun!.design.bulletsPerSecond = bulletsPerSecond;
                    shipMgr.state.chainGun!.isFiring = true;
                    switchToAvailableAmmo(shipMgr.state.chainGun!, shipMgr.state.magazine);

                    const i = makeIterationsData(1, numIterationsPerSecond);
                    for (const id of i) {
                        shipMgr.update(id);
                        spaceMgr.update(id);
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
                const numIterationsPerSecond = 20;
                const distanceGrace = 1_000;
                const targetRadius = 100;
                const spaceMgr = new SpaceManager();
                const shipObj = new Spaceship();
                shipObj.id = 'ship';
                shipObj.angle = rotation;
                const shipMgr = new shipManagerCtor(
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
                shipMgr.state.docking.mode = DockingMode.DOCKING;
                const maxTimeSeconds = 60 * 60;

                const i = makeIterationsData(
                    maxTimeSeconds,
                    numIterationsPerSecond * maxTimeSeconds,
                    () => shipMgr.state.docking.mode !== DockingMode.DOCKING,
                );
                for (const id of i) {
                    spaceMgr.update(id);
                    shipMgr.update(id);
                }
                expect(shipMgr.state.docking.mode).to.eql(DockingMode.DOCKED);
            }),
        );
    });
});
