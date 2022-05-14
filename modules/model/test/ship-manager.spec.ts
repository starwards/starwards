import { Explosion, ShipManager, SmartPilotMode, SpaceManager, Spaceship, SystemCondition, Vec2 } from '../src';

import { expect } from 'chai';
import fc from 'fast-check';

describe('ShipManager', () => {
    it('explosion must damage only affected areas', () => {
        fc.assert(
            fc.property(fc.integer({ min: 15, max: 20 }), (numIterationsPerSecond: number) => {
                const iterationTimeInSeconds = 1 / numIterationsPerSecond;
                const spaceMgr = new SpaceManager();
                const shipObj = new Spaceship();
                shipObj.id = '1';
                const shipMgr = new ShipManager(shipObj, spaceMgr);
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
                expect(shipMgr.state.chainGun.condition).to.equal(SystemCondition.OK);
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
                const shipMgr = new ShipManager(shipObj, spaceMgr);
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
                const shipMgr = new ShipManager(shipObj, spaceMgr);
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
});
