import { Explosion, ShipManager, SmartPilotMode, SpaceManager, Spaceship, Vec2, XY, limitPercisionHard } from '../src';

import { expect } from 'chai';
import fc from 'fast-check';

class MockDie {
    private _expectedRoll = 0;
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    public update(_: number) {}

    public getRoll(): number {
        return this._expectedRoll;
    }

    set expectedRoll(roll: number) {
        this._expectedRoll = roll;
    }
}

describe('ShipManager', () => {
    it('explosion must damage only affected areas', () => {
        fc.assert(
            fc.property(fc.integer({ min: 15, max: 20 }), (numIterationsPerSecond: number) => {
                const iterationTimeInSeconds = 1 / numIterationsPerSecond;
                const spaceMgr = new SpaceManager();
                const shipObj = new Spaceship();
                shipObj.id = '1';
                const die = new MockDie();
                const shipMgr = new ShipManager(shipObj, spaceMgr, die);
                die.expectedRoll = 1;
                spaceMgr.insert(shipObj);
                shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
                shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
                const explosion = new Explosion();
                explosion.position = Vec2.sum(shipObj.position, { x: -shipObj.radius, y: 0 });
                spaceMgr.insert(explosion);

                let timePassed = 0;
                while (timePassed <= explosion.secondsToLive) {
                    shipMgr.update(iterationTimeInSeconds);
                    spaceMgr.update(iterationTimeInSeconds);
                    timePassed += iterationTimeInSeconds;
                }

                const brokenInFront = shipMgr.getNumberOfBrokenPlatesInRange([-178, 178]);
                expect(brokenInFront).to.equal(0);
                expect(shipMgr.state.chainGun.broken).to.be.false;
                expect(shipMgr.state.chainGun.angleOffset).to.equal(0);
                expect(shipMgr.state.chainGun.coolingFailure).to.equal(0);
                for (const plate of shipMgr.state.armor.platesInRange([177, -177])) {
                    expect(plate.health).to.be.lessThan(200);
                }
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
                const shipMgr = new ShipManager(shipObj, spaceMgr, new MockDie());
                spaceMgr.insert(shipObj);
                shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
                shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
                shipMgr.chainGun(true);

                let timePassed = 0;
                while (timePassed <= 1) {
                    shipMgr.update(iterationTimeInSeconds);
                    spaceMgr.update(iterationTimeInSeconds);
                    timePassed += iterationTimeInSeconds;
                }
                const cannonShells = [...spaceMgr.state.getAll('CannonShell')];
                expect(cannonShells.length).to.be.closeTo(
                    Math.min(numIterationsPerSecond, shipMgr.state.chainGun.bulletsPerSecond),
                    1
                );
                expect(shipMgr.state.chainGunAmmo).to.equal(shipMgr.state.maxChainGunAmmo - cannonShells.length);
            })
        );
    });

    it('chaingun must not fire without ammo', () => {
        fc.assert(
            fc.property(fc.integer({ min: 15, max: 20 }), (numIterationsPerSecond: number) => {
                const iterationTimeInSeconds = 1 / numIterationsPerSecond;
                const spaceMgr = new SpaceManager();
                const shipObj = new Spaceship();
                shipObj.id = '1';
                const shipMgr = new ShipManager(shipObj, spaceMgr, new MockDie());
                spaceMgr.insert(shipObj);
                shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
                shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
                shipMgr.state.chainGunAmmo = 10;
                shipMgr.chainGun(true);
                let timePassed = 0;
                while (timePassed <= 1) {
                    shipMgr.update(iterationTimeInSeconds);
                    spaceMgr.update(iterationTimeInSeconds);
                    timePassed += iterationTimeInSeconds;
                }
                const cannonShells = [...spaceMgr.state.getAll('CannonShell')];
                expect(cannonShells.length).to.equal(10);
                expect(shipMgr.state.chainGunAmmo).to.equal(0);
            })
        );
    });

    it('chaingun with attitude damage must fire at an offset', () => {
        fc.assert(
            fc.property(
                fc.float({ min: 1, max: 180 }),
                fc.integer({ min: 15, max: 20 }),
                (angleOffset: number, numIterationsPerSecond: number) => {
                    const iterationTimeInSeconds = 1 / numIterationsPerSecond;
                    const spaceMgr = new SpaceManager();
                    const shipObj = new Spaceship();
                    const limitedAngleOffset = limitPercisionHard(angleOffset);
                    shipObj.id = '1';
                    const shipMgr = new ShipManager(shipObj, spaceMgr, new MockDie());
                    spaceMgr.insert(shipObj);
                    shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
                    shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
                    shipMgr.state.chainGun.angleOffset = limitedAngleOffset;
                    shipMgr.state.chainGun.constants.set('bulletDegreesDeviation', 0);
                    shipMgr.chainGun(true);
                    let timePassed = 0;
                    while (timePassed <= 1) {
                        shipMgr.update(iterationTimeInSeconds);
                        spaceMgr.update(iterationTimeInSeconds);
                        timePassed += iterationTimeInSeconds;
                    }

                    for (const cannonShell of spaceMgr.state.getAll('CannonShell')) {
                        expect(limitPercisionHard(XY.angleOf(cannonShell.velocity))).to.equal(limitedAngleOffset);
                    }
                }
            )
        );
    });

    it('chaingun with cooling failure must have reduced rate of fire', () => {
        fc.assert(
            fc.property(fc.integer({ min: 15, max: 20 }), (numIterationsPerSecond: number) => {
                const iterationTimeInSeconds = 1 / numIterationsPerSecond;
                const spaceMgr = new SpaceManager();
                const shipObj = new Spaceship();
                shipObj.id = '1';
                const shipMgr = new ShipManager(shipObj, spaceMgr, new MockDie());
                spaceMgr.insert(shipObj);
                shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
                shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
                shipMgr.state.chainGun.coolingFailure = 1;
                shipMgr.chainGun(true);
                let timePassed = 0;
                while (timePassed <= 1) {
                    shipMgr.update(iterationTimeInSeconds);
                    spaceMgr.update(iterationTimeInSeconds);
                    timePassed += iterationTimeInSeconds;
                }
                expect([...spaceMgr.state.getAll('CannonShell')].length).to.be.closeTo(
                    Math.floor(shipMgr.state.chainGun.bulletsPerSecond / 2),
                    1
                );
            })
        );
    });
});
