import { Damage, DamageManager, FRONT_ARC, SpaceManager, Spaceship, dragonflySF22, makeShipState } from '../src';

import { ArmorType } from '../src/logic/damage-matrix';
import { MockDie } from './ship-test-harness';
import { ShipState } from '../src/ship/ship-state';
import { expect } from 'chai';

interface Fixture {
    ship: Spaceship;
    state: ShipState;
    spaceManager: SpaceManager;
    damageManager: DamageManager;
}

function setUpShip(armorType: ArmorType = 'Composite', hasFaradayLayer = false): Fixture {
    const ship = new Spaceship();
    ship.id = 'test-ship';
    const state = makeShipState(ship.id, dragonflySF22);
    state.armor.design.armorType = armorType;
    state.armor.design.hasFaradayLayer = hasFaradayLayer;
    const spaceManager = new SpaceManager();
    spaceManager.insert(ship);
    const damageManager = new DamageManager(ship, state, spaceManager, new MockDie());
    return { ship, state, spaceManager, damageManager };
}

function frontDamage(amount: number, ammoType: Damage['ammoType']): Damage {
    return {
        id: 'd-1',
        amount,
        damageSurfaceArc: [FRONT_ARC[0] + 1, FRONT_ARC[1] - 1],
        damageDurationSeconds: 1,
        ammoType,
    };
}

describe('damage-manager × armor matrix (issue #1929)', () => {
    describe('Reactive armor', () => {
        it('absorbs Sabot hits as Resist (no plate damage on the cell side)', () => {
            const { state, damageManager } = setUpShip('Reactive');
            const initialHealthy = state.armor.numberOfHealthyPlates;
            damageManager.takeExternalDamage(frontDamage(50, 'MissileSabot'));
            // Resist outcome → no plates consumed.
            expect(state.armor.numberOfHealthyPlates).to.equal(initialHealthy);
        });

        it('Tandem on Reactive consumes cells (Critical)', () => {
            const { state, damageManager } = setUpShip('Reactive');
            const initialHealthy = state.armor.numberOfHealthyPlates;
            damageManager.takeExternalDamage(frontDamage(50, 'MissileTandem'));
            expect(state.armor.numberOfHealthyPlates).to.be.lessThan(initialHealthy);
        });

        it('AP on Reactive deals Normal damage and consumes cells in the hit area', () => {
            const { state, damageManager } = setUpShip('Reactive');
            const initialHealthy = state.armor.numberOfHealthyPlates;
            damageManager.takeExternalDamage(frontDamage(20, 'CannonAp'));
            expect(state.armor.numberOfHealthyPlates).to.be.lessThan(initialHealthy);
        });

        it('consumed Reactive cells expose internals (system damage reachable)', () => {
            const { state, damageManager } = setUpShip('Reactive');
            // AP is Normal vs Reactive → cells stripped in the hit arc, which
            // exposes the systems behind them and flags internal damage.
            const damagedInternals = damageManager.takeExternalDamage(frontDamage(20, 'CannonAp'));
            expect(state.armor.numberOfHealthyPlates).to.be.lessThan(state.armor.numberOfPlates);
            expect(damagedInternals).to.equal(true);
        });
    });

    describe('Faraday layer vs EMP', () => {
        it('Composite armor + EMP missile → bypasses plates entirely', () => {
            const { state, damageManager } = setUpShip('Composite', false);
            const initial = state.armor.armorPlates[0].health;
            damageManager.takeExternalDamage(frontDamage(50, 'MissileEmp'));
            // EMP ignores physical plates regardless of primary armor.
            expect(state.armor.armorPlates[0].health).to.equal(initial);
        });

        it('Composite + Faraday layer + EMP → resisted', () => {
            const { state, damageManager } = setUpShip('Composite', true);
            const initial = state.armor.armorPlates[0].health;
            damageManager.takeExternalDamage(frontDamage(50, 'MissileEmp'));
            // Faraday absorbs EMP — plates untouched (matrix says Resist for Faraday + EMP).
            expect(state.armor.armorPlates[0].health).to.equal(initial);
        });

        it('physical ammo (AP) vs Faraday primary armor → ignores plates, hits internals', () => {
            const { state, damageManager } = setUpShip('Faraday', false);
            const initial = state.armor.armorPlates[0].health;
            // Faraday doesn't stop physical hits — matrix returns 'ignores' for all
            // physical ammo, so plates are bypassed entirely (no plate damage)...
            const damagedInternals = damageManager.takeExternalDamage(frontDamage(50, 'CannonAp'));
            expect(state.armor.armorPlates[0].health).to.equal(initial);
            // ...but the hit lands on internal systems.
            expect(damagedInternals).to.equal(true);
        });
    });

    describe('Surface effect on Resist', () => {
        it('HE shell vs Whipple armor (Resist) does not damage plates', () => {
            const { state, damageManager } = setUpShip('Whipple');
            const initial = state.armor.armorPlates[0].health;
            damageManager.takeExternalDamage(frontDamage(100, 'CannonHe'));
            expect(state.armor.armorPlates[0].health).to.equal(initial);
        });

        it('SABOT vs Whipple (Vulnerable) chews through plates', () => {
            const { state, damageManager } = setUpShip('Whipple');
            const before = state.armor.armorPlates[0].health;
            damageManager.takeExternalDamage(frontDamage(800, 'MissileSabot'));
            // Vulnerable multiplier 2.0 against high damage clearly chips a plate.
            expect(state.armor.armorPlates[0].health).to.be.lessThan(before);
        });
    });

    describe('non-projectile damage path', () => {
        it('keeps the legacy flat-damage flow when ammoType is empty (collisions)', () => {
            const { state, damageManager } = setUpShip('Composite');
            const before = state.armor.armorPlates[0].health;
            const collision: Damage = {
                id: 'collision-1',
                amount: 100,
                damageSurfaceArc: [FRONT_ARC[0] + 1, FRONT_ARC[1] - 1],
                damageDurationSeconds: 1,
                ammoType: '',
            };
            damageManager.takeExternalDamage(collision);
            // Flat damage applies to plates directly — health drops.
            expect(state.armor.armorPlates[0].health).to.be.lessThan(before);
        });
    });
});
