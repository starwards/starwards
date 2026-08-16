import {
    AttackDamage,
    DamageManager,
    Explosion,
    FRONT_ARC,
    SpaceManager,
    Spaceship,
    Vec2,
    compositeArmor,
    damageProfiles,
    demoShip,
    makeShipState,
} from '../src';

import { MockDie } from './ship-test-harness';
import { expect } from 'chai';

// FRONT_ARC spans exactly 6 plates (see damage-manager-matrix.spec.ts), so each plate's own
// share of a hit is 1/6 of the damage.amount. demoShip's composite plate maxHealth is 100.
const FRONT_PLATE_COUNT = 6;

function setUpShip(id: string) {
    const ship = new Spaceship();
    ship.id = id;
    const state = makeShipState(ship.id, demoShip);
    for (const plate of state.armor.armorPlates) {
        plate.layers[0].design.assign(compositeArmor);
    }
    const spaceManager = new SpaceManager();
    spaceManager.insert(ship);
    const damageManager = new DamageManager(ship, state, spaceManager, new MockDie());
    return { state, spaceManager, damageManager };
}

function frontExplosionDamage(id: string, amount: number): AttackDamage {
    return {
        id,
        shipId: '',
        amount,
        damageSurfaceArc: [...FRONT_ARC],
        damageDurationSeconds: 1,
        damageType: 'HiExp',
        delivery: 'explosion',
        profile: damageProfiles.HiExp,
    };
}

describe('Explosion.breachHit (issue #2150)', () => {
    it('flags the causing explosion once it strikes a section that is already breached', () => {
        const { spaceManager, damageManager } = setUpShip('test-ship-breach');
        const explosion = new Explosion().init('blast-1', new Vec2(0, 0), 20);
        spaceManager.insert(explosion);
        spaceManager.forceFlushEntities();

        // zeroes every plate's single composite layer (100/6 ≈ 116.7 per plate) in one hit
        damageManager.takeWeaponDamage(frontExplosionDamage('blast-1', 700));
        expect(explosion.breachHit).to.equal(false);

        // a follow-up hit from the same blast, now landing on already-broken plates
        damageManager.takeWeaponDamage(frontExplosionDamage('blast-1', 50));
        expect(explosion.breachHit).to.equal(true);
    });

    it('leaves the explosion unflagged while armor still absorbs the hit', () => {
        const { spaceManager, damageManager } = setUpShip('test-ship-intact');
        const explosion = new Explosion().init('blast-2', new Vec2(0, 0), 20);
        spaceManager.insert(explosion);
        spaceManager.forceFlushEntities();

        damageManager.takeWeaponDamage(frontExplosionDamage('blast-2', 30 * FRONT_PLATE_COUNT));
        expect(explosion.breachHit).to.equal(false);
    });
});
