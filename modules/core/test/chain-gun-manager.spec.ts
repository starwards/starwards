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

        it('switches away from a depleted projectile when asked to check depletion (issue #2237)', () => {
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
            expect(magazine.count_ArmPenShell).to.be.greaterThan(0);

            chainGun.projectile = 'HiExpShell';
            magazine.setCount('HiExpShell', 0);
            switchToAvailableAmmo(chainGun, magazine, true);

            expect(chainGun.projectile).to.equal('ArmPenShell');
        });

        it('does not interrupt a round already chambered from the depleted type (no unload-and-refund flap)', () => {
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

            // The magazine's last HiExpShell round has already moved into the chamber (this is
            // what "count reaches 0" looks like mid-load, not an untouched depleted selection).
            chainGun.projectile = 'HiExpShell';
            chainGun.loadedProjectile = 'HiExpShell';
            magazine.setCount('HiExpShell', 0);

            switchToAvailableAmmo(chainGun, magazine, true);

            // Switching now would trigger ChainGunManager's unload path, crediting the chambered
            // round back to the magazine and undoing the depletion it was just switched away for.
            expect(chainGun.projectile).to.equal('HiExpShell');
        });

        it('falls back to None when every ammo type is depleted, even mid-selection', () => {
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

            chainGun.projectile = 'HiExpShell';
            for (const at of ammoTypes) {
                magazine.setCount(at, 0);
            }
            switchToAvailableAmmo(chainGun, magazine, true);

            expect(chainGun.projectile).to.equal('None');
        });

        it('does not flap away from a selection that still has ammo', () => {
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
            expect(magazine.count_ArmPenShell).to.be.greaterThan(0);

            chainGun.projectile = 'ArmPenShell';
            switchToAvailableAmmo(chainGun, magazine, true);

            expect(chainGun.projectile).to.equal('ArmPenShell');
        });

        it('leaves a depleted selection alone unless a depletion check is requested', () => {
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

            chainGun.projectile = 'HiExpShell';
            magazine.setCount('HiExpShell', 0);
            switchToAvailableAmmo(chainGun, magazine);

            expect(chainGun.projectile).to.equal('HiExpShell');
        });
    });

    describe('cluster missile ammo types', () => {
        function makeShip() {
            const spaceMgr = new SpaceManager();
            const shipObj = new Spaceship();
            shipObj.id = '1';
            const die = new MockDie();
            const shipMgr = new ShipManagerPc(shipObj, makeShipState(shipObj.id, demoShipConfig), spaceMgr, die);
            die.expectedRoll = 1;
            spaceMgr.insert(shipObj);
            shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
            shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
            return shipMgr;
        }

        it('the cycle visits both cluster types as their own stops before advancing to the next ammo type', () => {
            const shipMgr = makeShip();
            const tube = shipMgr.state.tubes[0];
            // demo-ship tube ammo order: HiExpMissile, ArmPenMissile, FragMissile, ClusterFragMissile, ClusterArmPenMissile, ElecMissile
            tube.projectile = 'FragMissile';

            const cycle = () => {
                tube.changeProjectileCommand = true;
                shipMgr.update([...makeIterationsData(0.001, 1)][0]);
            };

            cycle();
            expect(tube.projectile).to.equal('ClusterFragMissile');
            cycle();
            expect(tube.projectile).to.equal('ClusterArmPenMissile');
            cycle();
            expect(tube.projectile).to.equal('ElecMissile');
        });

        it('both cluster types draw on one shared magazine stock', () => {
            const magazine = makeShip().state.magazine;
            magazine.setCount('ClusterFragMissile', 3);
            expect(magazine.getCount('ClusterArmPenMissile')).to.equal(3);
            expect(magazine.getCount('ClusterMissile')).to.equal(3);
            expect(magazine.getMax('ClusterFragMissile')).to.equal(magazine.getMax('ClusterArmPenMissile'));
        });

        it('switching between cluster types re-selects the chambered round without unloading it', () => {
            const shipMgr = makeShip();
            const tube = shipMgr.state.tubes[0];
            const magazine = shipMgr.state.magazine;
            tube.projectile = 'ClusterFragMissile';
            tube.loadedProjectile = 'ClusterFragMissile';
            tube.loading = 1;
            const stock = magazine.getCount('ClusterMissile');

            tube.projectile = 'ClusterArmPenMissile';
            shipMgr.update([...makeIterationsData(0.001, 1)][0]);

            expect(tube.loadedProjectile).to.equal('ClusterArmPenMissile');
            expect(tube.loading).to.equal(1);
            expect(magazine.getCount('ClusterMissile')).to.equal(stock);
        });

        it('moves off the cluster types immediately if the mount stops allowing cluster', () => {
            const shipMgr = makeShip();
            const tube = shipMgr.state.tubes[0];
            tube.projectile = 'ClusterFragMissile';
            tube.design.use_ClusterMissile = false;

            shipMgr.update([...makeIterationsData(0.001, 1)][0]);

            expect(tube.projectile).to.not.be.oneOf(['ClusterFragMissile', 'ClusterArmPenMissile']);
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
                // your own shells are fully known to you; only ships demote, so it stays FULL
                expect(p.scanLevels[Faction.Gravitas]).to.equal(ScanLevel.FULL);
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

    // #2305: energy per unit of output must rise with power, not stay constant.
    it('chain gun loading energy draw rises more than proportionally with power', () => {
        const spaceMgr = new SpaceManager();
        const shipObj = new Spaceship();
        shipObj.id = '1';
        const die = new MockDie();
        const shipMgr = new ShipManagerPc(shipObj, makeShipState(shipObj.id, demoShipConfig), spaceMgr, die);
        die.expectedRoll = 1;
        spaceMgr.insert(shipObj);
        shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
        shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);

        const state = shipMgr.state;
        if (state.warp) state.warp.power = 0;
        state.maneuvering.power = 0;
        for (const thruster of state.thrusters) thruster.power = 0;
        for (const tube of state.tubes) tube.power = 0;
        for (const radar of state.radars) radar.power = 0;
        for (const chainGun of state.chainGuns.slice(1)) chainGun.power = 0;
        state.reactor.power = 0; // no income — the store is the whole supply

        const chainGun = state.chainGuns[0];
        chainGun.loadAmmo = true;
        switchToAvailableAmmo(chainGun, state.magazine);

        const drawnAt = (power: number) => {
            chainGun.power = power;
            chainGun.loading = 0;
            chainGun.loadedProjectile = 'None';
            state.reactor.energy = state.reactor.design.maxEnergy; // @range clamps any higher assignment
            const before = state.reactor.energy;
            for (const id of makeIterationsData(1, 1)) {
                shipMgr.update(id);
                spaceMgr.update(id);
            }
            return before - state.reactor.energy;
        };

        const drawnAtNormal = drawnAt(0.5); // PowerLevel.NORMAL
        const drawnAtMax = drawnAt(1); // PowerLevel.MAX

        // x = 2: draw ∝ power² ⇒ MAX/NORMAL draw ratio = (MAX/NORMAL)² = 4, for 2× output.
        expect(drawnAtMax).to.be.closeTo(drawnAtNormal * 4, drawnAtNormal * 0.01);
    });
});
