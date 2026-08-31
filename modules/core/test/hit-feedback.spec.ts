import {
    AttackDamage,
    DamageManager,
    FRONT_ARC,
    SpaceManager,
    Spaceship,
    damageProfiles,
    demoShip,
    makeShipState,
} from '../src';

import { ArmorLayerDesign } from '../src/ship/armor';
import { MockDie } from './ship-test-harness';
import { expect } from 'chai';

const FRONT_HIT_ARC: [number, number] = [...FRONT_ARC];

// an intact reactive cell defeats an ArmPen impact outright (see attack-resolution-manager.spec.ts:49-61)
// -- zero system defects, zero surface scrape. The perfect "shot scratched armor and nothing more" fixture.
const reactiveOverComposite: ArmorLayerDesign[] = [
    { type: 'reactive', plateMaxHealth: 100 },
    { type: 'composite', plateMaxHealth: 1000 },
];

function setUpDefender(spaceManager: SpaceManager, id: string) {
    const ship = new Spaceship();
    ship.id = id;
    const state = makeShipState(ship.id, { ...demoShip, armor: { numberOfPlates: 12, layers: reactiveOverComposite } });
    spaceManager.insert(ship);
    const damageManager = new DamageManager(ship, state, spaceManager, new MockDie());
    return damageManager;
}

function shotFrom(shipId: string, projectileId: string): AttackDamage {
    return {
        id: projectileId,
        shipId,
        amount: 50,
        damageSurfaceArc: FRONT_HIT_ARC,
        damageDurationSeconds: 1,
        damageType: 'ArmPen',
        delivery: 'impact',
        profile: damageProfiles.ArmPen,
    };
}

describe('shooter hitsLanded (issue #2190)', () => {
    it('credits the shooter even when the shot is fully absorbed by armor with no system damage', () => {
        const spaceManager = new SpaceManager();
        const shooter = new Spaceship();
        shooter.id = 'shooter';
        spaceManager.insert(shooter);
        const damageManager = setUpDefender(spaceManager, 'defender');
        spaceManager.forceFlushEntities();

        const resolution = damageManager.takeWeaponDamage(shotFrom('shooter', 'projectile-1'));

        expect(resolution).to.equal(false); // confirms nothing was actually damaged by this shot
        expect(shooter.hitsLanded).to.equal(1);
    });

    it('accumulates one credit per landed shot', () => {
        const spaceManager = new SpaceManager();
        const shooter = new Spaceship();
        shooter.id = 'shooter';
        spaceManager.insert(shooter);
        const damageManager = setUpDefender(spaceManager, 'defender');
        spaceManager.forceFlushEntities();

        damageManager.takeWeaponDamage(shotFrom('shooter', 'projectile-1'));
        damageManager.takeWeaponDamage(shotFrom('shooter', 'projectile-2'));

        expect(shooter.hitsLanded).to.equal(2);
    });

    it('does not credit or throw for damage with no attributable shooter (e.g. GM-spawned)', () => {
        const spaceManager = new SpaceManager();
        const damageManager = setUpDefender(spaceManager, 'defender');
        spaceManager.forceFlushEntities();

        expect(() => damageManager.takeWeaponDamage(shotFrom('', 'projectile-1'))).to.not.throw();
    });
});
