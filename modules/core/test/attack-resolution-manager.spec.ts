import {
    ArmorModelStats,
    AttackDamage,
    AttackResolutionManager,
    FRONT_ARC,
    WeaponDamageType,
    compositeArmor,
    damageProfiles,
    dragonflySF22,
    makeShipState,
    whippleArmor,
} from '../src';

import { ShipState } from '../src/ship/ship-state';
import { Spaceship } from '../src';
import { expect } from 'chai';

function setUpShip(armorStats: ArmorModelStats): ShipState {
    const ship = new Spaceship();
    ship.id = 'test-ship';
    const state = makeShipState(ship.id, dragonflySF22);
    for (const plate of state.armor.armorPlates) {
        plate.layers[0].design.assign(armorStats);
    }
    return state;
}

function frontDamage(amount: number, damageType: WeaponDamageType, delivery: 'impact' | 'explosion'): AttackDamage {
    return {
        id: 'd-1',
        amount,
        damageSurfaceArc: [...FRONT_ARC],
        damageDurationSeconds: 1,
        damageType,
        delivery,
        profile: damageProfiles[damageType],
    };
}

describe('AttackResolutionManager (issue #1975)', () => {
    it('resolves delivery + armor engagement into a channel split, without touching any system', () => {
        // HiExp vs Whipple with an amount too small to breach a plate: armor engagement blocks
        // the penetration channel entirely, and only the surface channel carries the hit —
        // resolution alone must reflect this split, with no system taking a defect roll yet.
        const state = setUpShip(whippleArmor);
        const resolution = new AttackResolutionManager(state).resolveAttack(frontDamage(10, 'HiExp', 'explosion'));

        expect(resolution.exposures).to.deep.equal([]);
        expect(resolution.surfaceChannel).to.not.equal(null);
        expect(resolution.surfaceChannel?.systems.length).to.be.greaterThan(0);
        expect(resolution.surfaceChannel?.systems.every((s) => !s.isInternal)).to.equal(true);

        // armor engagement is a real side effect of resolution (plate erosion), independent of
        // any system damage — this is the whole point of resolving attacks before applying them
        expect(state.armor.armorPlates[0].layers[0].health).to.be.lessThan(
            state.armor.armorPlates[0].layers[0].maxHealth,
        );
        // no system has taken any damage — resolution never rolls a defect
        for (const system of state.systems()) {
            expect(system.broken).to.equal(false);
        }
    });

    it('an ArmPen round through broken Composite armor resolves a penetration exposure and no surface channel', () => {
        const state = setUpShip(compositeArmor);
        for (const [, plate] of state.armor.platesInRange(FRONT_ARC)) {
            plate.layers[0].health = 0;
        }
        const resolution = new AttackResolutionManager(state).resolveAttack(frontDamage(60, 'ArmPen', 'impact'));

        expect(resolution.surfaceChannel).to.equal(null);
        expect(resolution.exposures.length).to.equal(1);
        expect(resolution.exposures[0].exposure).to.be.closeTo(1, 0.001);
    });
});
