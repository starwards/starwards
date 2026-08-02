import {
    AttackDamage,
    DamageManager,
    FRONT_ARC,
    ShipDie,
    ShipManagerPc,
    SpaceManager,
    Spaceship,
    WeaponDamageType,
    ammoDesigns,
    damageProfiles,
    dragonflySF22,
    makeShipState,
} from '../src';

import { ArmorLayerDesign } from '../src/ship/armor';
import { Die } from '../src/ship/ship-manager-abstract';
import { MockDie } from './ship-test-harness';
import { ShipState } from '../src/ship/ship-state';
import { expect } from 'chai';

/**
 * Regression pins for the spec §9 worked examples (docs/design/mechanics/damage-model-spec.md).
 * Each describe block replays one §9 narrative end-to-end with the real ammo numbers from
 * projectile.ts, so these tests encode the §8 ammo table through the §9 stories.
 */

interface Fixture {
    ship: Spaceship;
    state: ShipState;
    spaceManager: SpaceManager;
    damageManager: DamageManager;
}

const FRONT_HIT_ARC: [number, number] = [...FRONT_ARC];

// real ammo numbers (§8 table): contact rounds carry a flat damage, blast rounds a damageFactor
const ARM_PEN_MISSILE_DAMAGE = ammoDesigns.ArmPenMissile.damage; // 60
const TANDEM_MISSILE_DAMAGE = ammoDesigns.TandemMissile.damage; // 50
const ELEC_MISSILE_DAMAGE = ammoDesigns.ElecMissile.damage; // 25
const HI_EXP_MISSILE_BLAST = ammoDesigns.HiExpMissile.explosion.damageFactor; // 50

function setUpLayeredShip(layers: ArmorLayerDesign[], die: Die = new MockDie()): Fixture {
    const ship = new Spaceship();
    ship.id = 'test-ship';
    const state = makeShipState(ship.id, { ...dragonflySF22, armor: { numberOfPlates: 12, layers } });
    const spaceManager = new SpaceManager();
    spaceManager.insert(ship);
    const damageManager = new DamageManager(ship, state, spaceManager, die);
    return { ship, state, spaceManager, damageManager };
}

function frontDamage(
    amount: number,
    damageType: WeaponDamageType,
    delivery: 'impact' | 'explosion',
    id = 'd-1',
): AttackDamage {
    return {
        id,
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

function breachLayer(state: ShipState, layerIdx: number) {
    for (const plate of frontPlates(state)) {
        plate.layers[layerIdx].health = 0;
    }
}

const compositeOnly: ArmorLayerDesign[] = [{ type: 'composite', plateMaxHealth: 1000 }];

const reactiveOverComposite: ArmorLayerDesign[] = [
    { type: 'reactive', plateMaxHealth: 100 },
    { type: 'composite', plateMaxHealth: 1000 },
];

const fullStack: ArmorLayerDesign[] = [
    { type: 'reactive', plateMaxHealth: 100 },
    { type: 'whipple', plateMaxHealth: 500 },
    { type: 'composite', plateMaxHealth: 1000 },
];

describe('spec §9 worked examples', () => {
    // FRONT_HIT_ARC spans exactly 6 plates, so each plate's own share of a hit is 1/6 of the
    // damage.amount unless a test narrows the arc to a single plate (see the direct-hit test below)
    const FRONT_PLATE_COUNT = 6;

    describe('ArmPen missile vs Composite', () => {
        // §9: "contact, one event, amount 60. Armor row 2/0: the struck plate erodes 120;
        // exposure 0 (plates intact, no penetration), so no system damage."
        it('vs intact plates: erodes at x2, zero system damage', () => {
            const { state, damageManager } = setUpLayeredShip(compositeOnly);
            const damaged = damageManager.takeWeaponDamage(frontDamage(ARM_PEN_MISSILE_DAMAGE, 'ArmPen', 'impact'));
            for (const plate of frontPlates(state)) {
                // plateDamage_ArmPen 2 → each plate's own 1/6 share of the 60 damage × 2 = 20
                expect(plate.layers[0].health).to.be.closeTo(
                    1000 - (ARM_PEN_MISSILE_DAMAGE / FRONT_PLATE_COUNT) * 2,
                    0.1,
                );
            }
            expect(damaged).to.equal(false);
            expect(state.smartPilot.offsetFactor).to.equal(0);
            expect(state.warp!.damageFactor).to.equal(0);
            expect(state.magazine.capacity).to.equal(1);
        });

        // §9: "vs breached Composite section: exposure 1, a victim system is picked, and an
        // amount of 60 x 1.5 spills into a stack of coin-flip rolls ... landing several defects
        // into one system ... Everything else in the section: untouched."
        it('vs breached section: several defects land in ONE picked system, others untouched', () => {
            // ShipDie(2): pickSystem lands on the magazine and 3 of the 5 spillover rolls
            // (90 walked in damage50=20 steps) succeed — all on the same victim
            const { state, damageManager } = setUpLayeredShip(compositeOnly, new ShipDie(2));
            breachLayer(state, 0);
            const damaged = damageManager.takeWeaponDamage(frontDamage(ARM_PEN_MISSILE_DAMAGE, 'ArmPen', 'impact'));
            expect(damaged).to.equal(true);
            expect(state.magazine.capacity).to.be.closeTo(0.9 ** 3, 0.0001);
            // the other front internals never see this round (single scope)
            expect(state.smartPilot.offsetFactor).to.equal(0);
            expect(state.warp!.damageFactor).to.equal(0);
            expect(state.warp!.velocityFactor).to.equal(1);
        });

        // §9 / design intent: fighter-class plates are sized so a standard ArmPen missile
        // breaches a plate in one direct hit — 60 flat × plateDamage_ArmPen 2 = 120 erosion
        // vs the dragonfly's plateMaxHealth 100. A "direct hit" lands on a single plate, not
        // spread across the whole front arc, so this narrows the hit to one plate's own width.
        it('one ArmPen missile direct hit breaches a fighter plate', () => {
            const { state, damageManager } = setUpLayeredShip([...dragonflySF22.armor.layers]);
            const singlePlateArc: [number, number] = [FRONT_ARC[0], FRONT_ARC[0] + 20];
            const damaged = damageManager.takeWeaponDamage({
                ...frontDamage(ARM_PEN_MISSILE_DAMAGE, 'ArmPen', 'impact'),
                damageSurfaceArc: singlePlateArc,
            });
            const [directHitPlate] = [...state.armor.platesInRange(singlePlateArc)].map(([, plate]) => plate);
            expect(directHitPlate.layers[0].health).to.equal(0);
            // the breach opens within the same event — the assassin gets straight in
            expect(damaged).to.equal(true);
        });

        // §9: "landing several defects into one system: crippled or broken" — once the victim
        // breaks mid-application the remainder dissipates; no other system picks it up
        it('remainder dissipates when the victim breaks mid-application', () => {
            const { state, damageManager } = setUpLayeredShip(compositeOnly);
            breachLayer(state, 0);
            // MockDie picks candidates[0] = smartPilot; one more defect breaks it
            state.smartPilot.offsetFactor = state.smartPilot.design.offsetBrokenThreshold - 0.01;
            damageManager.takeWeaponDamage(frontDamage(600, 'ArmPen', 'impact'));
            expect(state.smartPilot.broken).to.equal(true);
            expect(state.smartPilot.offsetFactor).to.be.closeTo(state.smartPilot.design.offsetBrokenThreshold, 0.0001);
            // 600 × 1.5 = 900 worth of spillover died with the victim — nothing else was hit
            expect(state.magazine.capacity).to.equal(1);
            expect(state.warp!.damageFactor).to.equal(0);
            expect(state.warp!.velocityFactor).to.equal(1);
        });
    });

    describe('HiExp missile engulfment on a breach', () => {
        // §9: "HiExp missile vs the same breach: ... every internal in the section takes ~2-3
        // defects, plus the externals take the (weak, x0.25) scrape. Whole section bleeds."
        it('every internal in the section takes defect rolls, externals take the weak scrape', () => {
            const { state, damageManager } = setUpLayeredShip(compositeOnly);
            breachLayer(state, 0);
            const damaged = damageManager.takeWeaponDamage(frontDamage(HI_EXP_MISSILE_BLAST, 'HiExp', 'explosion'));
            expect(damaged).to.equal(true);
            // multi scope: ALL front internals bleed (MockDie: every roll succeeds)
            // smartPilot: 50 vs damage50 90 → 1 roll → one defect
            expect(state.smartPilot.offsetFactor).to.be.closeTo(0.01, 0.0001);
            // warp: 50 vs damage50 20 → 3 rolls → three defects
            expect(state.warp!.damageFactor).to.be.closeTo(0.15, 0.0001);
            // magazine bleeds too (ammo lost)
            expect(state.magazine.getCount('HiExpShell')).to.be.lessThan(state.magazine.max_HiExpShell);
            // externals take the weak scrape: 50 × SURFACE_EFFECT_FACTOR 0.05 × HiExp
            // surfaceDamageFactor 0.25 = 0.625 → one defect roll on the radar
            expect(state.radars[0].malfunctionRangeFactor).to.be.closeTo(0.05, 0.0001);
        });
    });

    describe('Frag missile vs any stack', () => {
        // §9: "Frag missile vs anyone: armor row 0/0 everywhere. Plates never touched, ERA never
        // wakes ... thrusters, radar, guns get sanded no matter what armor the ship wears."
        it('plates and cells untouched on a full Reactive > Whipple > Composite stack, externals sanded', () => {
            const { state, damageManager } = setUpLayeredShip(fullStack);
            const damaged = damageManager.takeWeaponDamage(frontDamage(100, 'Frag', 'explosion'));
            for (const plate of state.armor.armorPlates) {
                expect(plate.layers[0].health).to.equal(100); // reactive cells never wake
                expect(plate.layers[1].health).to.equal(500);
                expect(plate.layers[2].health).to.equal(1000);
            }
            expect(damaged).to.equal(true);
            expect(state.radars[0].malfunctionRangeFactor).to.be.greaterThan(0);
            // internals safe — frag never penetrates (hitsInternal false)
            expect(state.smartPilot.offsetFactor).to.equal(0);
            expect(state.warp!.damageFactor).to.equal(0);
        });

        // §9: frag sands "at x2" vs HiExp's weak x0.25 — shrapnel is purpose-built for equipment
        it('the Frag scrape is x8 the HiExp scrape', () => {
            expect(damageProfiles.Frag.surfaceDamageFactor).to.equal(2);
            expect(damageProfiles.HiExp.surfaceDamageFactor).to.equal(0.25);
        });
    });

    describe('ElecMissile: Reactive pops it, Composite lets it through', () => {
        // §9: "ElecMissile vs Reactive: contact, armor row 1/0 pop: a cell dies, the dart is
        // defeated, electronics safe, one cell spent."
        it('vs Reactive outer: one cell pops, electronics safe', () => {
            const { state, damageManager } = setUpLayeredShip(reactiveOverComposite);
            const damaged = damageManager.takeWeaponDamage(frontDamage(ELEC_MISSILE_DAMAGE, 'Elec', 'impact'));
            const popped = frontPlates(state).filter((plate) => plate.layers[0].health <= 0).length;
            expect(popped).to.equal(1);
            expect(damaged).to.equal(false);
            expect(state.radars[0].malfunctionRangeFactor).to.equal(0);
            expect(state.smartPilot.offsetFactor).to.equal(0);
        });

        // §9: "Same missile vs Composite: 0/1 transparent, so every electronics system
        // ship-wide rolls once at x2."
        it('vs plain Composite: bypass, ship-wide electronics roll at x2, non-electronics untouched', () => {
            const { state, damageManager } = setUpLayeredShip(compositeOnly);
            const damaged = damageManager.takeWeaponDamage(frontDamage(ELEC_MISSILE_DAMAGE, 'Elec', 'impact'));
            expect(damaged).to.equal(true);
            // plates are transparent to the dart — untouched
            for (const plate of state.armor.armorPlates) {
                expect(plate.layers[0].health).to.equal(1000);
            }
            // 25 × systemDamageFactor 2 = 50: radar (damage50 20) → 3 rolls → 0.15 with MockDie
            expect(state.radars[0].malfunctionRangeFactor).to.be.closeTo(0.15, 0.0001);
            // smartPilot (damage50 90) → 1 roll → 0.01; rear electronics (reactor) hit too
            expect(state.smartPilot.offsetFactor).to.be.closeTo(0.01, 0.0001);
            expect(state.reactor.effeciencyFactor).to.be.lessThan(1);
            // non-electronics untouched ship-wide
            for (const thruster of state.thrusters) {
                expect(thruster.angleError).to.equal(0);
                expect(thruster.availableCapacity).to.equal(1);
            }
            expect(state.maneuvering.efficiency).to.equal(1);
        });
    });

    describe('sequenced fire vs Reactive > Whipple > Composite', () => {
        // §9: "Tandem missiles pop the Reactive cells in the target arc (Whipple beneath would
        // pre-detonate them...)" — the precursor pops a cell, the main charge penetrates the
        // reactive layer (penetration 1) but the intact Whipple screen pre-detonates it
        it('(a) Tandem pops a cell and continues, but the intact Whipple screen pre-detonates it', () => {
            const { state, damageManager } = setUpLayeredShip(fullStack);
            const damaged = damageManager.takeWeaponDamage(frontDamage(TANDEM_MISSILE_DAMAGE, 'Tandem', 'impact'));
            const popped = frontPlates(state).filter((plate) => plate.layers[0].health <= 0).length;
            expect(popped).to.equal(1);
            // whipple blocks Tandem (plateDamage 0 / penetration 0): no erosion, walk stops
            for (const plate of state.armor.armorPlates) {
                expect(plate.layers[1].health).to.equal(500);
                expect(plate.layers[2].health).to.equal(1000);
            }
            expect(damaged).to.equal(false);
            expect(state.smartPilot.offsetFactor).to.equal(0);
        });

        // §9: "ArmPen was the wrong opener (each round costs a Reactive cell)"
        it('(b) ArmPen while cells remain: costs one cell, walk stops, inner layers untouched', () => {
            const { state, damageManager } = setUpLayeredShip(fullStack);
            const damaged = damageManager.takeWeaponDamage(frontDamage(ARM_PEN_MISSILE_DAMAGE, 'ArmPen', 'impact'));
            const popped = frontPlates(state).filter((plate) => plate.layers[0].health <= 0).length;
            expect(popped).to.equal(1);
            for (const plate of state.armor.armorPlates) {
                expect(plate.layers[1].health).to.equal(500);
                expect(plate.layers[2].health).to.equal(1000);
            }
            expect(damaged).to.equal(false);
        });

        // §9: "...but becomes the right finisher: with the cells stripped it passes the Whipple
        // screen untouched (0/1) and erodes the Composite core at 2x." — nothing popped, so the
        // round is not defeated and continues the walk inward
        it('(b) ArmPen after all cells in arc are spent: transits Whipple, erodes the Composite core at x2', () => {
            const { state, damageManager } = setUpLayeredShip(fullStack);
            breachLayer(state, 0); // all reactive cells in the arc already spent
            const damaged = damageManager.takeWeaponDamage(frontDamage(ARM_PEN_MISSILE_DAMAGE, 'ArmPen', 'impact'));
            // exposure 1 through the spent reactive layer, chained through the composite's
            // broken ratio (0 — intact): plates soak it, no internal damage yet
            expect(damaged).to.equal(false);
            expect(state.smartPilot.offsetFactor).to.equal(0);
            for (const plate of frontPlates(state)) {
                // whipple is transparent to ArmPen (0/1)
                expect(plate.layers[1].health).to.equal(500);
                // composite core eroded at plateDamage_ArmPen 2 → each plate's own 1/6 share of
                // the 60 damage × 2 = 20
                expect(plate.layers[2].health).to.be.closeTo(
                    1000 - (ARM_PEN_MISSILE_DAMAGE / FRONT_PLATE_COUNT) * 2,
                    0.1,
                );
            }
        });

        // §9: "HiExp ... slowly grinds the Reactive cells"
        it('(c) HiExp erodes cells without popping them, and armor damage persists across update ticks', () => {
            const { ship, state, spaceManager, damageManager } = setUpLayeredShip(fullStack);
            const manager = new ShipManagerPc(ship, state, spaceManager, new MockDie());
            damageManager.takeWeaponDamage(frontDamage(40, 'HiExp', 'explosion'));
            // each plate's own 1/6 share of the 40 damage erodes its reactive cells (eroded, not popped)
            for (const plate of frontPlates(state)) {
                expect(plate.layers[0].health).to.be.closeTo(100 - 40 / FRONT_PLATE_COUNT, 0.1);
            }
            // scratch the whipple screen too, then run the ship update loop
            frontPlates(state)[0].layers[1].health = 490;
            manager.update({ deltaSeconds: 10, deltaSecondsAvg: 10, totalSeconds: 10 });
            // armor does not heal — every layer stays at its damaged value until explicit repair
            expect(frontPlates(state)[0].layers[1].health).to.equal(490);
            for (const plate of frontPlates(state)) {
                expect(plate.layers[0].health).to.be.closeTo(100 - 40 / FRONT_PLATE_COUNT, 0.1);
            }
        });

        // §6 exposure chains multiplicatively — 3-layer extension of the armor-walk pin:
        // reactive half-broken (0.5) × whipple fully broken (1) × composite fully broken (1) = 0.5
        it('(d) exposure chains multiplicatively across all three layers', () => {
            const { state, damageManager } = setUpLayeredShip(fullStack);
            const plates = frontPlates(state);
            for (const [i, plate] of plates.entries()) {
                if (i < plates.length / 2) {
                    plate.layers[0].health = 0;
                }
                plate.layers[1].health = 0;
                plate.layers[2].health = 0;
            }
            const damaged = damageManager.takeWeaponDamage(frontDamage(40, 'HiExp', 'explosion'));
            expect(damaged).to.equal(true);
            // warp sees 40 × exposure 0.5 = 20 = exactly one damage50 step → one defect.
            // At exposure 1 it would take two rolls (0.10) — this pins the 0.5 chain.
            expect(state.warp!.damageFactor).to.be.closeTo(0.05, 0.0001);
            expect(state.smartPilot.offsetFactor).to.be.closeTo(0.01, 0.0001);
        });

        // §6/§9: an intact blocking layer stops the walk — even with every other layer bared
        it('(e) an intact blocking Whipple screen zeroes system damage entirely', () => {
            const { state, damageManager } = setUpLayeredShip(fullStack);
            for (const plate of frontPlates(state)) {
                plate.layers[0].health = 0; // cells spent
                plate.layers[2].health = 0; // core bared
            }
            const damaged = damageManager.takeWeaponDamage(frontDamage(1000, 'Tandem', 'impact'));
            expect(damaged).to.equal(false);
            for (const plate of frontPlates(state)) {
                expect(plate.layers[1].health).to.equal(500); // block never erodes
            }
            expect(state.smartPilot.offsetFactor).to.equal(0);
            expect(state.warp!.damageFactor).to.equal(0);
        });
    });
});
