import {
    AttackResolutionManager,
    FRONT_ARC,
    Spaceship,
    WeaponDamageType,
    damageProfiles,
    demoShip,
    makeShipState,
} from '../src';

import { ArmorLayerDesign } from '../src/ship/armor';
import { AttackDamage } from '../src/ship/attack-resolution-manager';
import { MockDie } from './ship-test-harness';
import { ShipState } from '../src/ship/ship-state';
import { expect } from 'chai';

const FRONT_HIT_ARC: [number, number] = [...FRONT_ARC];

function setUpLayeredShip(layers: ArmorLayerDesign[]) {
    const ship = new Spaceship();
    ship.id = 'test-ship';
    const state = makeShipState(ship.id, { ...demoShip, armor: { numberOfPlates: 12, layers } });
    const resolution = new AttackResolutionManager(state, new MockDie());
    return { state, resolution };
}

function frontDamage(amount: number, damageType: WeaponDamageType, delivery: 'impact' | 'explosion'): AttackDamage {
    return {
        id: 'd-1',
        amount,
        damageSurfaceArc: FRONT_HIT_ARC,
        damageDurationSeconds: 1,
        damageType,
        delivery,
        profile: damageProfiles[damageType],
    };
}

function frontPlates(state: ShipState) {
    return [...state.armor.platesInRange(FRONT_HIT_ARC)].map(([, plate]) => plate);
}

const reactiveOverComposite: ArmorLayerDesign[] = [
    { type: 'reactive', plateMaxHealth: 100 },
    { type: 'composite', plateMaxHealth: 1000 },
];

describe('AttackResolutionManager', () => {
    it('resolves armor engagement (delivery + layer walk) before any system is handed damage', () => {
        const { state, resolution } = setUpLayeredShip(reactiveOverComposite);
        // ArmPen impact vs an intact reactive cell: the round is defeated by the pop, so the
        // resolution produces no system hits at all — but the armor engagement (the pop) is
        // still a resolved side effect, independent of whether any system ever takes damage.
        const result = resolution.resolveWeaponAttack(frontDamage(50, 'ArmPen', 'impact'));
        expect(result.hits).to.deep.equal([]);
        expect(result.damagedExternals).to.equal(false);
        expect(frontPlates(state).filter((plate) => plate.layers[0].health <= 0).length).to.equal(1);
        for (const plate of state.armor.armorPlates) {
            expect(plate.layers[1].health).to.equal(1000);
        }
    });

    it('splits resolved damage into the penetration channel and the surface channel', () => {
        const { resolution } = setUpLayeredShip(reactiveOverComposite);
        // HiExp explosion vs an intact reactive cell: the cell erodes but does not break, so the
        // penetration channel stays shut (no internal hits) while the surface channel still
        // scrapes every hull-mounted system in the arc.
        const result = resolution.resolveWeaponAttack(frontDamage(40, 'HiExp', 'explosion'));
        expect(result.damagedExternals).to.equal(true);
        expect(result.hits.length).to.be.greaterThan(0);
        for (const hit of result.hits) {
            expect(hit.system.isInternal).to.equal(false);
            expect(hit.percentageOfBrokenPlates).to.equal(1);
            expect(hit.damage.amount).to.be.closeTo(40 * 0.05 * damageProfiles.HiExp.surfaceDamageFactor, 0.0001);
        }
    });

    it('reports breachHit only once the plate a hit lands on was already broken (issue #2150)', () => {
        const thinComposite: ArmorLayerDesign[] = [{ type: 'composite', plateMaxHealth: 1 }];
        const { resolution } = setUpLayeredShip(thinComposite);
        // FRONT_ARC spans several plates; a large enough blast zeroes every plate it touches in one hit
        const first = resolution.resolveWeaponAttack(frontDamage(400, 'HiExp', 'explosion'));
        expect(first.breachHit).to.equal(false);
        // a follow-up hit on the same, now-broken section reads as a breach hit
        const second = resolution.resolveWeaponAttack(frontDamage(50, 'HiExp', 'explosion'));
        expect(second.breachHit).to.equal(true);
    });
});
