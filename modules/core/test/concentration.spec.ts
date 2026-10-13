import { AttackDamage, AttackResolutionManager } from '../src/ship/attack-resolution-manager';
import { FRONT_ARC, Spaceship, ammoDesigns, ammoTypes, damageProfiles, demoShip, makeShipState } from '../src';
import { MockDie } from './ship-test-harness';
import { expect } from 'chai';

// KB damage-model spec §4/§8: concentration scales the expected defects a damage event inflicts
// on each system it reaches, without touching plate erosion.

function breachedShip() {
    const ship = new Spaceship();
    ship.id = 'test-ship';
    const state = makeShipState(ship.id, demoShip);
    for (const plate of state.armor.armorPlates) {
        for (const layer of plate.layers) {
            layer.health = 0;
        }
    }
    return { state, resolution: new AttackResolutionManager(state, new MockDie()) };
}

function hit(concentration?: number): AttackDamage {
    return {
        id: 'd-1',
        shipId: '',
        amount: 40,
        damageSurfaceArc: [...FRONT_ARC],
        damageDurationSeconds: 1,
        damageType: 'HiExp',
        delivery: 'explosion',
        profile: damageProfiles.HiExp,
        ...(concentration === undefined ? {} : { concentration }),
    };
}

describe('concentration (per-round defect scaling)', () => {
    it('defaults to 1: an event without one rolls the plain system amount', () => {
        const { resolution } = breachedShip();
        const internal = resolution.resolveWeaponAttack(hit()).hits.filter((h) => h.system.isInternal);
        expect(internal.length).to.be.greaterThan(0);
        for (const h of internal) {
            expect(h.damage.amount).to.equal(40);
        }
    });

    it('scales every penetration-channel roll amount by the concentration', () => {
        const { resolution } = breachedShip();
        const internal = resolution.resolveWeaponAttack(hit(3)).hits.filter((h) => h.system.isInternal);
        expect(internal.length).to.be.greaterThan(0);
        for (const h of internal) {
            expect(h.damage.amount).to.equal(120);
        }
    });

    it('leaves the surface scrape alone', () => {
        const { resolution } = breachedShip();
        const plain = resolution.resolveWeaponAttack(hit(1)).hits.filter((h) => !h.system.isInternal);
        const { resolution: r2 } = breachedShip();
        const concentrated = r2.resolveWeaponAttack(hit(3)).hits.filter((h) => !h.system.isInternal);
        expect(concentrated.map((h) => h.damage.amount)).to.deep.equal(plain.map((h) => h.damage.amount));
    });

    it('every round declares a positive concentration', () => {
        for (const ammo of ammoTypes) {
            expect(ammoDesigns[ammo].concentration, ammo).to.be.greaterThan(0);
        }
    });

    it('the ArmPen missile is the assassin: more concentrated than the cluster AP mode, which beats the shell', () => {
        expect(ammoDesigns.ArmPenMissile.concentration).to.be.greaterThan(
            ammoDesigns.ClusterArmPenMissile.concentration,
        );
        expect(ammoDesigns.ClusterArmPenMissile.concentration).to.be.greaterThan(ammoDesigns.ArmPenShell.concentration);
        expect(ammoDesigns.ArmPenShell.concentration).to.equal(1);
    });
});
