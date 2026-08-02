import {
    AttackDamage,
    Damage,
    DamageManager,
    FRONT_ARC,
    SpaceManager,
    Spaceship,
    WeaponDamageType,
    damageProfiles,
    demoShip,
    makeShipState,
} from '../src';

import { ArmorLayerDesign } from '../src/ship/armor';
import { MockDie } from './ship-test-harness';
import { ShipState } from '../src/ship/ship-state';
import { expect } from 'chai';

interface Fixture {
    ship: Spaceship;
    state: ShipState;
    spaceManager: SpaceManager;
    damageManager: DamageManager;
}

const FRONT_HIT_ARC: [number, number] = [...FRONT_ARC];

function setUpLayeredShip(layers: ArmorLayerDesign[]): Fixture {
    const ship = new Spaceship();
    ship.id = 'test-ship';
    const state = makeShipState(ship.id, { ...demoShip, armor: { numberOfPlates: 12, layers } });
    const spaceManager = new SpaceManager();
    spaceManager.insert(ship);
    const damageManager = new DamageManager(ship, state, spaceManager, new MockDie());
    return { ship, state, spaceManager, damageManager };
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

function countBrokenLayer(state: ShipState, layerIdx: number): number {
    return frontPlates(state).filter((plate) => plate.layers[layerIdx].health <= 0).length;
}

const reactiveOverComposite: ArmorLayerDesign[] = [
    { type: 'reactive', plateMaxHealth: 100 },
    { type: 'composite', plateMaxHealth: 1000 },
];

const whippleOverComposite: ArmorLayerDesign[] = [
    { type: 'whipple', plateMaxHealth: 500 },
    { type: 'composite', plateMaxHealth: 1000 },
];

const hardenedOverComposite: ArmorLayerDesign[] = [
    { type: 'hardened', plateMaxHealth: 1000 },
    { type: 'composite', plateMaxHealth: 1000 },
];

describe('layered armor resolution walk', () => {
    it('ArmPen impact vs Reactive over Composite: pops one cell, walk stops, composite untouched', () => {
        const { state, damageManager } = setUpLayeredShip(reactiveOverComposite);
        const damaged = damageManager.takeWeaponDamage(frontDamage(50, 'ArmPen', 'impact'));
        expect(countBrokenLayer(state, 0)).to.equal(1);
        for (const plate of state.armor.armorPlates) {
            expect(plate.layers[1].health).to.equal(1000);
        }
        expect(damaged).to.equal(false);
        expect(state.smartPilot.offsetFactor).to.equal(0);
    });

    // FRONT_HIT_ARC spans exactly 6 plates, so each plate's own share of a hit is 1/6 of the
    // damage.amount — none of these hits is confined to a single plate
    const FRONT_PLATE_COUNT = 6;

    it('Tandem impact vs Reactive over Composite: pops a cell AND continues into the composite', () => {
        const { state, damageManager } = setUpLayeredShip(reactiveOverComposite);
        damageManager.takeWeaponDamage(frontDamage(50, 'Tandem', 'impact'));
        expect(countBrokenLayer(state, 0)).to.equal(1);
        // penetration_Tandem 1 vs reactive → chain stays 1; composite erodes at its Tandem
        // plateFactor (1) using each plate's own 1/6 share of the 50 damage
        for (const plate of frontPlates(state)) {
            expect(plate.layers[1].health).to.be.closeTo(1000 - 50 / FRONT_PLATE_COUNT, 0.1);
        }
    });

    it('HiExp explosion vs Reactive over Composite: cells erode (no pop), composite untouched, externals scraped', () => {
        const { state, damageManager } = setUpLayeredShip(reactiveOverComposite);
        const damaged = damageManager.takeWeaponDamage(frontDamage(40, 'HiExp', 'explosion'));
        expect(countBrokenLayer(state, 0)).to.equal(0);
        for (const plate of frontPlates(state)) {
            expect(plate.layers[0].health).to.be.closeTo(100 - 40 / FRONT_PLATE_COUNT, 0.1);
            expect(plate.layers[1].health).to.equal(1000);
        }
        // intact cells, penetration 0 → chain 0 → no internal damage; the surface scrape lands
        expect(damaged).to.equal(true);
        expect(state.smartPilot.offsetFactor).to.equal(0);
    });

    it('ArmPen impact transits Whipple untouched and erodes Composite at x2', () => {
        const { state, damageManager } = setUpLayeredShip(whippleOverComposite);
        const damaged = damageManager.takeWeaponDamage(frontDamage(100, 'ArmPen', 'impact'));
        for (const plate of frontPlates(state)) {
            expect(plate.layers[0].health).to.equal(500);
            expect(plate.layers[1].health).to.be.closeTo(1000 - (100 / FRONT_PLATE_COUNT) * 2, 0.1);
        }
        expect(damaged).to.equal(false);
    });

    it('HiExp explosion erodes the Whipple screen at quarter rate, composite untouched while intact', () => {
        const { state, damageManager } = setUpLayeredShip(whippleOverComposite);
        damageManager.takeWeaponDamage(frontDamage(100, 'HiExp', 'explosion'));
        for (const plate of frontPlates(state)) {
            expect(plate.layers[0].health).to.be.closeTo(500 - (100 / FRONT_PLATE_COUNT) * 0.25, 0.1);
            expect(plate.layers[1].health).to.equal(1000);
        }
    });

    it('an intact blocking outer layer zeroes system damage even over a fully broken inner layer', () => {
        // Tandem vs Whipple is 0/0 (blocked) while it engages composite
        const { state, damageManager } = setUpLayeredShip(whippleOverComposite);
        for (const plate of frontPlates(state)) {
            plate.layers[1].health = 0;
        }
        const damaged = damageManager.takeWeaponDamage(frontDamage(1000, 'Tandem', 'impact'));
        expect(damaged).to.equal(false);
        for (const plate of frontPlates(state)) {
            expect(plate.layers[0].health).to.equal(500);
        }
        expect(state.smartPilot.offsetFactor).to.equal(0);
    });

    it('exposure chains multiplicatively across layers', () => {
        // outer hardened half-broken (3 of 6 front plates), inner composite fully broken:
        // single-scope exposure = 0.5 × 1 = 0.5. Tandem 360 (= 4 × smartPilot damage50 of 90)
        // × factor 1 × 0.5 = 180 = 2 × damage50 → exactly 2 defect rolls, all succeeding with
        // MockDie (expectedRoll 0) → smartPilot offset 0.02
        const { state, damageManager } = setUpLayeredShip(hardenedOverComposite);
        const plates = frontPlates(state);
        for (const [i, plate] of plates.entries()) {
            if (i < 3) {
                plate.layers[0].health = 0;
            }
            plate.layers[1].health = 0;
        }
        const damaged = damageManager.takeWeaponDamage(frontDamage(360, 'Tandem', 'impact'));
        expect(damaged).to.equal(true);
        expect(state.smartPilot.offsetFactor).to.be.closeTo(0.02, 0.0001);
    });

    describe('collision vs layered armor (pinned choice: spec is silent on collisions)', () => {
        function collision(amount: number): Damage {
            return {
                id: 'collision-1',
                amount,
                damageSurfaceArc: FRONT_HIT_ARC,
                damageDurationSeconds: 1,
                damageType: 'Collision',
                delivery: 'impact',
            };
        }

        it('erodes the outermost layer with intact health per plate', () => {
            const { state, damageManager } = setUpLayeredShip(reactiveOverComposite);
            const plates = frontPlates(state);
            plates[0].layers[0].health = 0;
            damageManager.takeCollisionDamage(collision(50));
            // the plate with a spent outer layer takes the erosion on its next layer in
            expect(plates[0].layers[1].health).to.be.closeTo(950, 0.001);
            expect(plates[1].layers[0].health).to.be.closeTo(50, 0.001);
            expect(plates[1].layers[1].health).to.equal(1000);
        });

        it('reaches systems only where a plate is fully broken (all layers)', () => {
            const { state, damageManager } = setUpLayeredShip(reactiveOverComposite);
            const plates = frontPlates(state);
            plates[0].layers[0].health = 0;
            const partiallyBroken = damageManager.takeCollisionDamage(collision(1));
            expect(partiallyBroken).to.equal(false);
            plates[0].layers[1].health = 0;
            const fullyBroken = damageManager.takeCollisionDamage({ ...collision(1), id: 'collision-2' });
            expect(fullyBroken).to.equal(true);
        });
    });
});
