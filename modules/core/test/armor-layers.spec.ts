import {
    ArmorDesign,
    AttackDamage,
    DamageManager,
    DamageType,
    FRONT_ARC,
    RTuple2,
    SpaceManager,
    Spaceship,
    compositeArmor,
    damageProfiles,
    dragonflySF22,
    faradayArmor,
    makeArmor,
    makeShipState,
    whippleArmor,
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

// build a full ArmorDesign layer from a stats row (aligned 12-plate ring, thick plates)
function layer(stats: Partial<ArmorDesign>, plateMaxHealth = 1500): ArmorDesign {
    return {
        numberOfPlates: 12,
        healRate: 3,
        plateMaxHealth,
        plateDamage_HiExp: 0,
        plateDamage_ArmPen: 0,
        plateDamage_Frag: 0,
        plateDamage_Tandem: 0,
        plateDamage_Elec: 0,
        penetration_HiExp: 0,
        penetration_ArmPen: 0,
        penetration_Frag: 0,
        penetration_Tandem: 0,
        penetration_Elec: 0,
        singleUsePlates: false,
        deflectsSurfaceEffect: false,
        ...stats,
    };
}

// outermost-first list of layer stats rows
function setUpLayered(...designs: ArmorDesign[]): Fixture {
    const ship = new Spaceship();
    ship.id = 'test-ship';
    const state = makeShipState(ship.id, dragonflySF22);
    state.armor = makeArmor(designs);
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

const composite = layer(compositeArmor);
const whipple = layer(whippleArmor);
const faraday = layer(faradayArmor);

describe('layered armor stacks (issue #1966)', () => {
    describe('schema', () => {
        it('a plain Composite ship is a single-layer stack (base only, no coats)', () => {
            const { state } = setUpLayered(composite);
            expect(state.armor.coats.length).to.equal(0);
            expect(state.armor.layersOutsideIn).to.have.lengthOf(1);
            expect(state.armor.numberOfPlates).to.equal(12);
        });

        it('Whipple > Composite stacks the coat outside the base, aligned geometry', () => {
            const { state } = setUpLayered(whipple, composite);
            expect(state.armor.coats.length).to.equal(1);
            const stack = state.armor.layersOutsideIn;
            expect(stack).to.have.lengthOf(2);
            // outermost first
            expect(stack[0].design.plateDamage_HiExp).to.equal(0.25); // Whipple
            expect(stack[1].design.plateDamage_ArmPen).to.equal(2); // Composite base
            // base is state.armor itself (backward-compatible accessor)
            expect(stack[1]).to.equal(state.armor);
            expect(stack[0].degreesPerPlate).to.equal(state.armor.degreesPerPlate);
        });
    });

    describe('resolution walk (spec §6 outcomes)', () => {
        it('ArmPen is transparent through Whipple then erodes Composite at 2x', () => {
            const { state, damageManager } = setUpLayered(whipple, composite);
            const whippleBefore = state.armor.coats[0].armorPlates[0].health;
            const compositeBefore = state.armor.armorPlates[0].health;
            const damaged = damageManager.takeWeaponDamage(frontDamage(60, 'ArmPen'));
            // Whipple untouched (0/1 transparent), Composite eroded amount*2
            expect(state.armor.coats[0].armorPlates[0].health).to.equal(whippleBefore);
            expect(compositeBefore - state.armor.armorPlates[0].health).to.be.closeTo(120, 0.001);
            // composite plates still hold, so nothing reaches internals
            expect(damaged).to.equal(false);
            expect(state.smartPilot.offsetFactor).to.equal(0);
        });

        it('ArmPen reaches internals once the Composite core is breached (Whipple still stands)', () => {
            const { state, damageManager } = setUpLayered(whipple, composite);
            for (const [, plate] of state.armor.platesInRange([FRONT_ARC[0] + 1, FRONT_ARC[1] - 1])) {
                plate.health = 0;
            }
            const damaged = damageManager.takeWeaponDamage(frontDamage(60, 'ArmPen'));
            expect(damaged).to.equal(true);
        });

        it('HiExp grinds the Whipple screen at 0.25x and never reaches the Composite core', () => {
            const { state, damageManager } = setUpLayered(whipple, composite);
            const whippleBefore = state.armor.coats[0].armorPlates[0].health;
            const compositeBefore = state.armor.armorPlates[0].health;
            damageManager.takeWeaponDamage(frontDamage(100, 'HiExp'));
            expect(whippleBefore - state.armor.coats[0].armorPlates[0].health).to.be.closeTo(25, 0.001);
            expect(state.armor.armorPlates[0].health).to.equal(compositeBefore);
            expect(state.smartPilot.offsetFactor).to.equal(0);
        });

        it('Tandem is blocked outright by an intact Whipple (0/0) — core untouched', () => {
            const { state, damageManager } = setUpLayered(whipple, composite);
            const whippleBefore = state.armor.coats[0].armorPlates[0].health;
            const compositeBefore = state.armor.armorPlates[0].health;
            const damaged = damageManager.takeWeaponDamage(frontDamage(50, 'Tandem'));
            expect(state.armor.coats[0].armorPlates[0].health).to.equal(whippleBefore);
            expect(state.armor.armorPlates[0].health).to.equal(compositeBefore);
            expect(damaged).to.equal(false);
        });
    });

    describe('multiplicative exposure chaining (spec §6)', () => {
        // a fractional-penetration engaging layer: exposure = max(penetration, brokenRatio) = 0.5 while intact
        const half = layer({ plateDamage_HiExp: 1, penetration_HiExp: 0.5 }, 1e9);

        it('one intact fractional layer exposes 0.5', () => {
            const { damageManager } = setUpLayered(half);
            const exposure = (damageManager as unknown as ExposureProbe).stackAreaExposure(
                'HiExp',
                FRONT_ARC,
                FRONT_ARC,
            );
            expect(exposure).to.be.closeTo(0.5, 1e-6);
        });

        it('two intact fractional layers chain to 0.25 (multiplicative, not additive)', () => {
            const { damageManager } = setUpLayered(half, half);
            const exposure = (damageManager as unknown as ExposureProbe).stackAreaExposure(
                'HiExp',
                FRONT_ARC,
                FRONT_ARC,
            );
            expect(exposure).to.be.closeTo(0.25, 1e-6);
        });

        it('an intact blocking layer zeroes the product regardless of inner exposure', () => {
            // outer Whipple blocks Tandem (0/0), inner fractional would expose — product must be 0
            const innerHalf = layer({ plateDamage_Tandem: 1, penetration_Tandem: 0.5 }, 1e9);
            const { damageManager } = setUpLayered(whipple, innerHalf);
            const exposure = (damageManager as unknown as ExposureProbe).stackAreaExposure(
                'Tandem',
                FRONT_ARC,
                FRONT_ARC,
            );
            expect(exposure).to.equal(0);
        });
    });

    describe('Faraday as a real layer (withFaradayLayer helper deleted)', () => {
        it('Faraday coat over Composite blocks Elec (cage layer, not a stat merge)', () => {
            const { state, damageManager } = setUpLayered(faraday, composite);
            const damaged = damageManager.takeWeaponDamage(frontDamage(1000, 'Elec'));
            expect(damaged).to.equal(false);
            expect(state.radar.malfunctionRangeFactor).to.equal(0);
        });

        it('physical rounds pass the Faraday coat and engage the Composite base', () => {
            const { state, damageManager } = setUpLayered(faraday, composite);
            const before = state.armor.armorPlates[0].health;
            damageManager.takeWeaponDamage(frontDamage(60, 'ArmPen'));
            // Faraday transparent to physical (0/1), Composite base engages at 2x
            expect(before - state.armor.armorPlates[0].health).to.be.closeTo(120, 0.001);
        });
    });

    describe('repair covers all layers', () => {
        it('resetShipState restores every layer to full health', async () => {
            const { state } = setUpLayered(whipple, composite);
            state.armor.coats[0].armorPlates[0].health = 0;
            state.armor.armorPlates[0].health = 0;
            const { resetShipState } = await import('../src');
            resetShipState(state);
            expect(state.armor.coats[0].armorPlates[0].health).to.equal(state.armor.coats[0].design.plateMaxHealth);
            expect(state.armor.armorPlates[0].health).to.equal(state.armor.design.plateMaxHealth);
        });
    });
});

interface ExposureProbe {
    stackAreaExposure(type: DamageType, areaHitRange: RTuple2, areaArc: RTuple2): number;
}
