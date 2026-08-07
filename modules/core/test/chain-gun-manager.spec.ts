import {
    Faction,
    ScanLevel,
    ShipDie,
    ShipManagerPc,
    SmartPilotMode,
    SpaceManager,
    Spaceship,
    ammoTypes,
    makeShipState,
    shipConfigurations,
} from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';

import { expect } from 'chai';
import { switchToAvailableAmmo } from '../src/ship/chain-gun-manager';

const demoShipConfig = shipConfigurations['demo-ship'];

describe('ChainGunManager', () => {
    afterEach(() => jest.restoreAllMocks());

    describe('switchToAvailableAmmo', () => {
        it('selects ammo when projectile is None', () => {
            const spaceMgr = new SpaceManager();
            const shipObj = new Spaceship();
            shipObj.id = '1';
            const die = new MockDie();
            const shipMgr = new ShipManagerPc(shipObj, makeShipState(shipObj.id, demoShipConfig), spaceMgr, die);
            die.expectedRoll = 1;
            spaceMgr.insert(shipObj);
            shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
            shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);

            const chainGun = shipMgr.state.chainGuns[0];
            const magazine = shipMgr.state.magazine;

            // Ensure magazine has ammo
            expect(magazine.count_HiExpShell).to.be.greaterThan(0);

            chainGun.projectile = 'None';
            switchToAvailableAmmo(chainGun, magazine);

            expect(chainGun.projectile).to.not.equal('None');
        });

        it('stays None if no ammo available', () => {
            const spaceMgr = new SpaceManager();
            const shipObj = new Spaceship();
            shipObj.id = '1';
            const die = new MockDie();
            const shipMgr = new ShipManagerPc(shipObj, makeShipState(shipObj.id, demoShipConfig), spaceMgr, die);
            die.expectedRoll = 1;
            spaceMgr.insert(shipObj);
            shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
            shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);

            const chainGun = shipMgr.state.chainGuns[0];
            const magazine = shipMgr.state.magazine;

            // Deplete all ammo
            for (const at of ammoTypes) {
                magazine.setCount(at, 0);
            }

            chainGun.projectile = 'None';
            switchToAvailableAmmo(chainGun, magazine);

            expect(chainGun.projectile).to.equal('None');
        });
    });

    describe('loading and firing', () => {
        it('decrements magazine ammo on fire', () => {
            const spaceMgr = new SpaceManager();
            const shipObj = new Spaceship();
            shipObj.id = '1';
            const die = new MockDie();
            const shipMgr = new ShipManagerPc(shipObj, makeShipState(shipObj.id, demoShipConfig), spaceMgr, die);
            die.expectedRoll = 1;
            spaceMgr.insert(shipObj);
            shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
            shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);

            const chainGun = shipMgr.state.chainGuns[0];
            chainGun.isFiring = true;
            chainGun.loadAmmo = true;
            switchToAvailableAmmo(chainGun, shipMgr.state.magazine);

            const initialCount = shipMgr.state.magazine.count_HiExpShell;

            // Simulate enough time for loading and firing
            const i = makeIterationsData(2, 40);
            for (const id of i) {
                shipMgr.update(id);
                spaceMgr.update(id);
            }

            expect(shipMgr.state.magazine.count_HiExpShell).to.be.lessThan(initialCount);
        });

        it('stamps fired projectiles with the firing ship id and advanced scan for its faction', () => {
            const spaceMgr = new SpaceManager();
            const shipObj = new Spaceship();
            shipObj.id = 'ship-A';
            shipObj.faction = Faction.Gravitas;
            const die = new MockDie();
            const shipMgr = new ShipManagerPc(shipObj, makeShipState(shipObj.id, demoShipConfig), spaceMgr, die);
            die.expectedRoll = 1;
            spaceMgr.insert(shipObj);
            shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
            shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);

            const chainGun = shipMgr.state.chainGuns[0];
            chainGun.isFiring = true;
            chainGun.loadAmmo = true;
            switchToAvailableAmmo(chainGun, shipMgr.state.magazine);

            const i = makeIterationsData(2, 40);
            for (const id of i) {
                shipMgr.update(id);
                spaceMgr.update(id);
            }

            const projectiles = [...spaceMgr.state.getAll('Projectile')];
            expect(projectiles.length).to.be.greaterThan(0);
            for (const p of projectiles) {
                expect(p.shipId).to.equal(shipObj.id);
                // your own shells are always identifiable to you, and never more than that: BASIC
                // is a shell's ceiling, so it never demotes and never takes a scan queue slot
                expect(p.scanLevels[Faction.Gravitas]).to.equal(ScanLevel.BASIC);
            }
        });

        it('replay determinism: two independent runs with the same die seed fire identical projectile angles', () => {
            function run(seed: number) {
                const spaceMgr = new SpaceManager();
                const shipObj = new Spaceship();
                shipObj.id = '1';
                const die = new ShipDie(seed);
                const shipMgr = new ShipManagerPc(shipObj, makeShipState(shipObj.id, demoShipConfig), spaceMgr, die);
                spaceMgr.insert(shipObj);
                shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
                shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);

                const chainGun = shipMgr.state.chainGuns[0];
                chainGun.isFiring = true;
                chainGun.loadAmmo = true;
                switchToAvailableAmmo(chainGun, shipMgr.state.magazine);

                const i = makeIterationsData(2, 200);
                for (const id of i) {
                    shipMgr.update(id);
                    spaceMgr.update(id);
                }
                return [...spaceMgr.state.getAll('Projectile')].map((p) => p.angle);
            }

            const runA = run(42);
            const runB = run(42);
            const runC = run(43);

            expect(runA.length).to.be.greaterThan(0);
            expect(runA).to.deep.equal(runB);
            expect(runA).to.not.deep.equal(runC);
        });

        it('does not fire when effectiveness is zero', () => {
            const spaceMgr = new SpaceManager();
            const shipObj = new Spaceship();
            shipObj.id = '1';
            const die = new MockDie();
            const shipMgr = new ShipManagerPc(shipObj, makeShipState(shipObj.id, demoShipConfig), spaceMgr, die);
            die.expectedRoll = 1;
            spaceMgr.insert(shipObj);
            shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
            shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);

            const chainGun = shipMgr.state.chainGuns[0];
            // Set power to 0 so effectiveness = 0
            chainGun.power = 0;
            chainGun.isFiring = true;
            chainGun.loadAmmo = true;
            switchToAvailableAmmo(chainGun, shipMgr.state.magazine);

            // Simulate time
            const i = makeIterationsData(2, 40);
            for (const id of i) {
                shipMgr.update(id);
                spaceMgr.update(id);
            }

            const projectiles = [...spaceMgr.state.getAll('Projectile')];
            expect(projectiles.length).to.equal(0);
        });
    });
});
