import {
    ArmorModelStats,
    AttackDamage,
    Damage,
    DamageManager,
    DamageType,
    Explosion,
    FRONT_ARC,
    SpaceManager,
    Spaceship,
    compositeArmor,
    damageProfiles,
    dragonflySF22,
    faradayArmor,
    hardenedArmor,
    makeShipState,
    reactiveArmor,
    whippleArmor,
    withFaradayLayer,
} from '../src';

import { MockDie } from './ship-test-harness';
import { ShipState } from '../src/ship/ship-state';
import { Vec2 } from '../src';
import { expect } from 'chai';

interface Fixture {
    ship: Spaceship;
    state: ShipState;
    spaceManager: SpaceManager;
    damageManager: DamageManager;
}

function setUpShip(armorStats: ArmorModelStats = compositeArmor): Fixture {
    const ship = new Spaceship();
    ship.id = 'test-ship';
    const state = makeShipState(ship.id, dragonflySF22);
    state.armor.design.assign(armorStats);
    const spaceManager = new SpaceManager();
    spaceManager.insert(ship);
    const damageManager = new DamageManager(ship, state, spaceManager, new MockDie());
    return { ship, state, spaceManager, damageManager };
}

function frontDamage(amount: number, damageType: DamageType): AttackDamage {
    return {
        id: 'd-1',
        amount,
        damageSurfaceArc: [FRONT_ARC[0] + 1, FRONT_ARC[1] - 1],
        damageDurationSeconds: 1,
        damageType,
        profile: damageProfiles[damageType],
    };
}

describe('damage-manager × armor design stats (issue #1929)', () => {
    describe('Reactive armor (single-use cells)', () => {
        it('ArmPen pops cells but is defeated — no system damage on the popping hit', () => {
            const { state, damageManager } = setUpShip(reactiveArmor);
            const initialHealthy = state.armor.numberOfHealthyPlates;
            const damaged = damageManager.takeWeaponDamage(frontDamage(50, 'ArmPen'));
            expect(state.armor.numberOfHealthyPlates).to.be.lessThan(initialHealthy);
            expect(damaged).to.equal(false);
            expect(state.smartPilot.offsetFactor).to.equal(0);
        });

        it('a defeated hit pops exactly one cell and consumes the damaging explosion', () => {
            const { state, spaceManager, damageManager } = setUpShip(reactiveArmor);
            const explosion = new Explosion().init('d-1', new Vec2(0, 0), 20);
            spaceManager.insert(explosion);
            spaceManager.forceFlushEntities();
            const initialHealthy = state.armor.numberOfHealthyPlates;
            damageManager.takeWeaponDamage(frontDamage(50, 'HiExp'));
            expect(initialHealthy - state.armor.numberOfHealthyPlates).to.equal(1);
            expect(explosion.destroyed).to.equal(true);
        });

        it('Tandem pops a cell but is not consumed — the main charge lives on', () => {
            const { state, spaceManager, damageManager } = setUpShip(reactiveArmor);
            const explosion = new Explosion().init('d-1', new Vec2(0, 0), 60);
            spaceManager.insert(explosion);
            spaceManager.forceFlushEntities();
            const initialHealthy = state.armor.numberOfHealthyPlates;
            damageManager.takeWeaponDamage(frontDamage(50, 'Tandem'));
            expect(initialHealthy - state.armor.numberOfHealthyPlates).to.equal(1);
            expect(explosion.destroyed).to.equal(false);
        });

        it('a follow-up hit on the bared section gets through (cells do not heal)', () => {
            const { damageManager } = setUpShip(reactiveArmor);
            damageManager.takeWeaponDamage(frontDamage(50, 'ArmPen'));
            const damaged = damageManager.takeWeaponDamage({ ...frontDamage(50, 'ArmPen'), id: 'd-2' });
            expect(damaged).to.equal(true);
        });

        it('Elec pops cells and is blocked — electronics untouched', () => {
            const { state, damageManager } = setUpShip(reactiveArmor);
            const initialHealthy = state.armor.numberOfHealthyPlates;
            const damaged = damageManager.takeWeaponDamage(frontDamage(50, 'Elec'));
            expect(state.armor.numberOfHealthyPlates).to.be.lessThan(initialHealthy);
            expect(damaged).to.equal(false);
            expect(state.radar.malfunctionRangeFactor).to.equal(0);
        });

        it('Tandem consumes cells and exposes internals fully', () => {
            const { state, damageManager } = setUpShip(reactiveArmor);
            const initialHealthy = state.armor.numberOfHealthyPlates;
            const damagedInternals = damageManager.takeWeaponDamage(frontDamage(50, 'Tandem'));
            expect(state.armor.numberOfHealthyPlates).to.be.lessThan(initialHealthy);
            expect(damagedInternals).to.equal(true);
        });
    });

    describe('Elec hits and the Faraday layer', () => {
        it('Composite armor + Elec hit → bypasses plates entirely', () => {
            const { state, damageManager } = setUpShip(compositeArmor);
            const initial = state.armor.armorPlates[0].health;
            const damagedInternals = damageManager.takeWeaponDamage(frontDamage(50, 'Elec'));
            expect(state.armor.armorPlates[0].health).to.equal(initial);
            expect(damagedInternals).to.equal(true);
        });

        it('Composite + Faraday layer + Elec hit → blocked', () => {
            const { state, damageManager } = setUpShip(withFaradayLayer(compositeArmor));
            const initial = state.armor.armorPlates[0].health;
            const damagedInternals = damageManager.takeWeaponDamage(frontDamage(50, 'Elec'));
            expect(state.armor.armorPlates[0].health).to.equal(initial);
            expect(damagedInternals).to.equal(false);
        });

        it('physical (ArmPen) vs pure Faraday armor → ignores plates, hits internals', () => {
            const { state, damageManager } = setUpShip(faradayArmor);
            const initial = state.armor.armorPlates[0].health;
            const damagedInternals = damageManager.takeWeaponDamage(frontDamage(50, 'ArmPen'));
            expect(state.armor.armorPlates[0].health).to.equal(initial);
            expect(damagedInternals).to.equal(true);
        });
    });

    describe('surface effect on blocked hits', () => {
        it('HiExp vs Whipple (plateDamage 0.25) erodes plates at quarter rate and scrapes externals', () => {
            const { state, damageManager } = setUpShip(whippleArmor);
            const initial = state.armor.armorPlates[0].health;
            const damagedExternals = damageManager.takeWeaponDamage(frontDamage(100, 'HiExp'));
            expect(initial - state.armor.armorPlates[0].health).to.be.closeTo(25, 0.001);
            expect(damagedExternals).to.equal(true);
        });

        it('Frag vs Whipple is blocked but still returns surface damage', () => {
            const { state, damageManager } = setUpShip(whippleArmor);
            const initial = state.armor.armorPlates[0].health;
            const damagedExternals = damageManager.takeWeaponDamage(frontDamage(100, 'Frag'));
            expect(state.armor.armorPlates[0].health).to.equal(initial);
            expect(damagedExternals).to.equal(true);
        });

        it('ArmPen vs Whipple punches straight through — plates untouched, internals hit', () => {
            const { state, damageManager } = setUpShip(whippleArmor);
            const before = state.armor.armorPlates[0].health;
            const damaged = damageManager.takeWeaponDamage(frontDamage(800, 'ArmPen'));
            expect(state.armor.armorPlates[0].health).to.equal(before);
            expect(damaged).to.equal(true);
        });

        it('HiExp vs Hardened (plateDamage 0.5) erodes plates at half rate', () => {
            const { state, damageManager } = setUpShip(hardenedArmor);
            const before = state.armor.armorPlates[0].health;
            damageManager.takeWeaponDamage(frontDamage(100, 'HiExp'));
            expect(before - state.armor.armorPlates[0].health).to.be.closeTo(50, 0.001);
        });

        it('Frag vs Composite scrapes externals even while plates hold', () => {
            const { state, damageManager } = setUpShip(compositeArmor);
            const damaged = damageManager.takeWeaponDamage(frontDamage(100, 'Frag'));
            expect(damaged).to.equal(true);
            expect(state.radar.malfunctionRangeFactor).to.be.greaterThan(0);
            // internals untouched — the scrape only reaches hull-mounted systems
            expect(state.smartPilot.offsetFactor).to.equal(0);
            expect(state.warp.damageFactor).to.equal(0);
        });

        it('HiExp vs Reactive: scrape deflected, cells pop, nothing penetrates', () => {
            const { state, damageManager } = setUpShip(reactiveArmor);
            const damaged = damageManager.takeWeaponDamage(frontDamage(1000, 'HiExp'));
            expect(damaged).to.equal(false);
            expect(state.armor.numberOfHealthyPlates).to.be.lessThan(state.armor.numberOfPlates);
            expect(state.radar.malfunctionRangeFactor).to.equal(0);
        });

        it('Frag vs Reactive still scrapes — a shrapnel cloud cannot be deflected', () => {
            const { state, damageManager } = setUpShip(reactiveArmor);
            const damaged = damageManager.takeWeaponDamage(frontDamage(1000, 'Frag'));
            expect(damaged).to.equal(true);
            // reactive cells do not react to shrapnel — no cell consumed
            expect(state.armor.numberOfHealthyPlates).to.equal(state.armor.numberOfPlates);
            expect(state.radar.malfunctionRangeFactor).to.be.greaterThan(0);
        });
    });

    describe('system scoping regressions', () => {
        it('Elec hit damages electronics ship-wide and nothing else', () => {
            const { state, damageManager } = setUpShip(compositeArmor);
            damageManager.takeWeaponDamage(frontDamage(1000, 'Elec'));
            // electronics defects appear (front AND rear electronics)
            expect(state.radar.malfunctionRangeFactor).to.be.greaterThan(0);
            expect(state.smartPilot.offsetFactor).to.be.greaterThan(0);
            expect(state.warp.damageFactor).to.be.greaterThan(0);
            // non-electronics untouched
            for (const thruster of state.thrusters) {
                expect(thruster.angleError).to.equal(0);
                expect(thruster.availableCapacity).to.equal(1);
            }
            expect(state.maneuvering.efficiency).to.equal(1);
        });

        it('an engaging Elec hit spanning both ship areas damages each electronics system once', () => {
            // Faraday-over-nothing strawman: the plates engage Elec and are all broken, so
            // exposure is 1 in both areas — electronics must still be damaged exactly once
            const { state, damageManager } = setUpShip({ ...compositeArmor, plateDamage_Elec: 1, penetration_Elec: 0 });
            for (const plate of state.armor.armorPlates) {
                plate.health = 0;
            }
            damageManager.takeWeaponDamage({
                id: 'd-1',
                amount: 1000,
                damageSurfaceArc: [-45, 135],
                damageDurationSeconds: 1,
                damageType: 'Elec',
                profile: damageProfiles.Elec,
            });
            expect(state.radar.malfunctionRangeFactor).to.be.closeTo(0.05, 0.0001);
        });

        it('surface-effect hit with plates intact damages only external systems', () => {
            const { state, damageManager } = setUpShip(whippleArmor);
            damageManager.takeWeaponDamage(frontDamage(1000, 'HiExp'));
            // while plates hold, only the surface scrape lands — and it targets externals
            expect(state.radar.malfunctionRangeFactor).to.be.greaterThan(0);
            // internal systems untouched
            expect(state.smartPilot.offsetFactor).to.equal(0);
            expect(state.warp.damageFactor).to.equal(0);
            expect(state.maneuvering.efficiency).to.equal(1);
        });

        it('ArmPen (single scope) vs pure Faraday damages exactly one internal system', () => {
            const { state, damageManager } = setUpShip(faradayArmor);
            damageManager.takeWeaponDamage(frontDamage(1000, 'ArmPen'));
            const internalDefects = [
                state.smartPilot.offsetFactor > 0,
                state.warp.damageFactor > 0,
                state.maneuvering.efficiency < 1,
                state.reactor.effeciencyFactor < 1 || state.reactor.energy < state.reactor.design.maxEnergy,
                state.magazine.capacity < 1 || state.magazine.getCount('HiExpShell') < state.magazine.max_HiExpShell,
            ].filter(Boolean).length;
            expect(internalDefects).to.equal(1);
        });

        it('blocked non-surface-effect hit (ArmPen vs Hardened, plates intact) leaves systems untouched', () => {
            const { state, damageManager } = setUpShip(hardenedArmor);
            const damaged = damageManager.takeWeaponDamage(frontDamage(100, 'ArmPen'));
            expect(damaged).to.equal(false);
            expect(state.radar.malfunctionRangeFactor).to.equal(0);
            expect(state.smartPilot.offsetFactor).to.equal(0);
        });

        it('broken plates expose area systems on engaging hits (Composite + HiExp)', () => {
            const { state, damageManager } = setUpShip(compositeArmor);
            // pre-break all front plates so exposure is 1
            for (const [, plate] of state.armor.platesInRange([FRONT_ARC[0] + 1, FRONT_ARC[1] - 1])) {
                plate.health = 0;
            }
            const damaged = damageManager.takeWeaponDamage(frontDamage(1000, 'HiExp'));
            expect(damaged).to.equal(true);
            expect(state.smartPilot.offsetFactor).to.be.greaterThan(0);
        });
    });

    describe('non-projectile damage path', () => {
        it('untyped damage (collisions) takes the flat-damage flow', () => {
            const { state, damageManager } = setUpShip(compositeArmor);
            const before = state.armor.armorPlates[0].health;
            const collision: Damage = {
                id: 'collision-1',
                amount: 100,
                damageSurfaceArc: [FRONT_ARC[0] + 1, FRONT_ARC[1] - 1],
                damageDurationSeconds: 1,
                damageType: null,
            };
            damageManager.takeCollisionDamage(collision);
            expect(state.armor.armorPlates[0].health).to.be.lessThan(before);
        });
    });
});
