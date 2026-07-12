import {
    ArmorModelStats,
    Damage,
    DamageManager,
    FRONT_ARC,
    SpaceManager,
    Spaceship,
    compositeArmor,
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

function frontDamage(amount: number, damageType: Damage['damageType']): Damage {
    return {
        id: 'd-1',
        amount,
        damageSurfaceArc: [FRONT_ARC[0] + 1, FRONT_ARC[1] - 1],
        damageDurationSeconds: 1,
        damageType,
    };
}

describe('damage-manager × armor design stats (issue #1929)', () => {
    describe('Reactive armor (single-use cells)', () => {
        it('does not engage ArmPen hits (no cell consumed)', () => {
            const { state, damageManager } = setUpShip(reactiveArmor);
            const initialHealthy = state.armor.numberOfHealthyPlates;
            damageManager.takeExternalDamage(frontDamage(50, 'ArmPen'));
            expect(state.armor.numberOfHealthyPlates).to.equal(initialHealthy);
        });

        it('Tandem consumes cells and exposes internals fully', () => {
            const { state, damageManager } = setUpShip(reactiveArmor);
            const initialHealthy = state.armor.numberOfHealthyPlates;
            const damagedInternals = damageManager.takeExternalDamage(frontDamage(50, 'Tandem'));
            expect(state.armor.numberOfHealthyPlates).to.be.lessThan(initialHealthy);
            expect(damagedInternals).to.equal(true);
        });
    });

    describe('Elec hits and the Faraday layer', () => {
        it('Composite armor + Elec hit → bypasses plates entirely', () => {
            const { state, damageManager } = setUpShip(compositeArmor);
            const initial = state.armor.armorPlates[0].health;
            const damagedInternals = damageManager.takeExternalDamage(frontDamage(50, 'Elec'));
            expect(state.armor.armorPlates[0].health).to.equal(initial);
            expect(damagedInternals).to.equal(true);
        });

        it('Composite + Faraday layer + Elec hit → blocked', () => {
            const { state, damageManager } = setUpShip(withFaradayLayer(compositeArmor));
            const initial = state.armor.armorPlates[0].health;
            const damagedInternals = damageManager.takeExternalDamage(frontDamage(50, 'Elec'));
            expect(state.armor.armorPlates[0].health).to.equal(initial);
            expect(damagedInternals).to.equal(false);
        });

        it('physical (ArmPen) vs pure Faraday armor → ignores plates, hits internals', () => {
            const { state, damageManager } = setUpShip(faradayArmor);
            const initial = state.armor.armorPlates[0].health;
            const damagedInternals = damageManager.takeExternalDamage(frontDamage(50, 'ArmPen'));
            expect(state.armor.armorPlates[0].health).to.equal(initial);
            expect(damagedInternals).to.equal(true);
        });
    });

    describe('surface effect on blocked hits', () => {
        it('HiExp vs Whipple armor does not damage plates but scrapes externals', () => {
            const { state, damageManager } = setUpShip(whippleArmor);
            const initial = state.armor.armorPlates[0].health;
            const damagedExternals = damageManager.takeExternalDamage(frontDamage(100, 'HiExp'));
            expect(state.armor.armorPlates[0].health).to.equal(initial);
            expect(damagedExternals).to.equal(true);
        });

        it('Frag vs Whipple is blocked but still returns surface damage', () => {
            const { state, damageManager } = setUpShip(whippleArmor);
            const initial = state.armor.armorPlates[0].health;
            const damagedExternals = damageManager.takeExternalDamage(frontDamage(100, 'Frag'));
            expect(state.armor.armorPlates[0].health).to.equal(initial);
            expect(damagedExternals).to.equal(true);
        });

        it('ArmPen vs Whipple (plateDamage 2) chews through plates', () => {
            const { state, damageManager } = setUpShip(whippleArmor);
            const before = state.armor.armorPlates[0].health;
            damageManager.takeExternalDamage(frontDamage(800, 'ArmPen'));
            expect(state.armor.armorPlates[0].health).to.be.lessThan(before);
        });

        it('HiExp vs Hardened (plateDamage 0.5) erodes plates at half rate', () => {
            const { state, damageManager } = setUpShip(hardenedArmor);
            const before = state.armor.armorPlates[0].health;
            damageManager.takeExternalDamage(frontDamage(100, 'HiExp'));
            expect(before - state.armor.armorPlates[0].health).to.be.closeTo(50, 0.001);
        });

        it('Frag vs Composite scrapes externals even while plates hold', () => {
            const { state, damageManager } = setUpShip(compositeArmor);
            const damaged = damageManager.takeExternalDamage(frontDamage(100, 'Frag'));
            expect(damaged).to.equal(true);
            expect(state.radar.malfunctionRangeFactor).to.be.greaterThan(0);
            // internals untouched — the scrape only reaches hull-mounted systems
            expect(state.smartPilot.offsetFactor).to.equal(0);
            expect(state.warp.damageFactor).to.equal(0);
        });

        it('HiExp vs Reactive is deflected — no scrape, no cell consumed', () => {
            const { state, damageManager } = setUpShip(reactiveArmor);
            const damaged = damageManager.takeExternalDamage(frontDamage(1000, 'HiExp'));
            expect(damaged).to.equal(false);
            expect(state.armor.numberOfHealthyPlates).to.equal(state.armor.numberOfPlates);
            expect(state.radar.malfunctionRangeFactor).to.equal(0);
        });
    });

    describe('system scoping regressions', () => {
        it('Elec hit damages electronics ship-wide and nothing else', () => {
            const { state, damageManager } = setUpShip(compositeArmor);
            damageManager.takeExternalDamage(frontDamage(1000, 'Elec'));
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

        it('surface-effect hit on blocked armor damages only external systems', () => {
            const { state, damageManager } = setUpShip(whippleArmor);
            damageManager.takeExternalDamage(frontDamage(1000, 'HiExp'));
            // hitsInternal=true HiExp on blocked armor → surface effect targets externals
            expect(state.radar.malfunctionRangeFactor).to.be.greaterThan(0);
            // internal systems untouched
            expect(state.smartPilot.offsetFactor).to.equal(0);
            expect(state.warp.damageFactor).to.equal(0);
            expect(state.maneuvering.efficiency).to.equal(1);
        });

        it('ArmPen (single scope) vs pure Faraday damages exactly one internal system', () => {
            const { state, damageManager } = setUpShip(faradayArmor);
            damageManager.takeExternalDamage(frontDamage(1000, 'ArmPen'));
            const internalDefects = [
                state.smartPilot.offsetFactor > 0,
                state.warp.damageFactor > 0,
                state.maneuvering.efficiency < 1,
                state.reactor.effeciencyFactor < 1 || state.reactor.energy < state.reactor.design.maxEnergy,
                state.magazine.capacity < 1 || state.magazine.getCount('HiExpShell') < state.magazine.max_HiExpShell,
            ].filter(Boolean).length;
            expect(internalDefects).to.equal(1);
        });

        it('blocked non-surface-effect hit (ArmPen vs Reactive) leaves the ship untouched', () => {
            const { state, damageManager } = setUpShip(reactiveArmor);
            const damaged = damageManager.takeExternalDamage(frontDamage(1000, 'ArmPen'));
            expect(damaged).to.equal(false);
            expect(state.armor.numberOfHealthyPlates).to.equal(state.armor.numberOfPlates);
            expect(state.radar.malfunctionRangeFactor).to.equal(0);
        });

        it('broken plates expose area systems on engaging hits (Composite + HiExp)', () => {
            const { state, damageManager } = setUpShip(compositeArmor);
            // pre-break all front plates so exposure is 1
            for (const [, plate] of state.armor.platesInRange([FRONT_ARC[0] + 1, FRONT_ARC[1] - 1])) {
                plate.health = 0;
            }
            const damaged = damageManager.takeExternalDamage(frontDamage(1000, 'HiExp'));
            expect(damaged).to.equal(true);
            expect(state.smartPilot.offsetFactor).to.be.greaterThan(0);
        });
    });

    describe('non-projectile damage path', () => {
        it('keeps the legacy flat-damage flow when damageType is null (collisions)', () => {
            const { state, damageManager } = setUpShip(compositeArmor);
            const before = state.armor.armorPlates[0].health;
            const collision: Damage = {
                id: 'collision-1',
                amount: 100,
                damageSurfaceArc: [FRONT_ARC[0] + 1, FRONT_ARC[1] - 1],
                damageDurationSeconds: 1,
                damageType: null,
            };
            damageManager.takeExternalDamage(collision);
            expect(state.armor.armorPlates[0].health).to.be.lessThan(before);
        });
    });
});
