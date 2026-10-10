import {
    ArmorModelName,
    AttackResolutionManager,
    ShipArea,
    SpaceManager,
    Spaceship,
    Tuple2,
    WeaponDamageType,
    ammoDesigns,
    ammoTypes,
    armorModels,
    damageProfiles,
    demoShip,
    makeShipState,
} from '../src';
import { Fixture, PLATE_MAX_HEALTH, buildArmorAmmoMatrix, matrixToMarkdown } from './armor-ammo-matrix-harness';

import { MockDie } from './ship-test-harness';
import { expect } from 'chai';
import fs from 'fs';
import path from 'path';

// a single plate's own angular slice (12 plates in dragonflyArmor → 30° each): the whole
// hit lands on exactly one plate, so `share` in the resolution walk is always 1
const SINGLE_PLATE_ARC: Tuple2 = [0, 1];

// `makeArmor` requires the innermost layer to be composite, and an intact composite backing
// engages HiExp/ArmPen — zeroing the exposure chain for every tested model and making
// the penetration channel unobservable. Pre-breaking the backing makes it transparent
// (broken → exposure 1), so what reaches the systems is governed solely by the tested layer.
function createFixture(model: ArmorModelName): Fixture {
    const ship = new Spaceship();
    ship.id = 'qa-armor-matrix-ship';
    const state = makeShipState(ship.id, {
        ...demoShip,
        armor: {
            numberOfPlates: 12,
            layers: [
                { type: model, plateMaxHealth: PLATE_MAX_HEALTH },
                { type: 'composite', plateMaxHealth: 1000 },
            ],
        },
    });
    for (const plate of state.armor.armorPlates) {
        plate.layers[1].health = 0;
    }
    new SpaceManager().insert(ship);
    const resolution = new AttackResolutionManager(state, new MockDie());
    const [, plate] = [...state.armor.platesInRange(SINGLE_PLATE_ARC)][0];
    const layer = plate.layers[0];
    // the exact set of systems the surface channel can ever hit for this hit arc — static per
    // ship, independent of armor state or damage type. Used to split resolveWeaponAttack's
    // result structurally (its own doc comment: "ordered surface-channel hits first, then
    // penetration-channel hits") instead of by comparing damage amounts, which only works by
    // coincidence and would silently misclassify the moment a profile is tuned so that
    // 0.05 × surfaceDamageFactor happens to equal systemDamageFactor.
    const surfaceEligibleCount = state.systemsByAreas(ShipArea.front).filter((s) => !s.isInternal).length;
    return {
        response: (damageType: WeaponDamageType) => layer.design.response(damageType),
        factors: (damageType: WeaponDamageType) => ({
            plateDamageFactor: layer.design.plateDamage(damageType),
            penetrationFactor: layer.design.penetration(damageType),
        }),
        fire(damageType: WeaponDamageType, delivery: 'impact' | 'explosion', amount: number) {
            const profile = damageProfiles[damageType];
            const healthBefore = layer.health;
            const { hits } = resolution.resolveWeaponAttack({
                id: 'qa-shot',
                amount,
                damageSurfaceArc: SINGLE_PLATE_ARC,
                damageDurationSeconds: 1,
                damageType,
                delivery,
                profile,
                shipId: '',
            });
            const surfaceCount = profile.surfaceEffect ? surfaceEligibleCount : 0;
            const surface = hits.slice(0, surfaceCount);
            const penetration = hits.slice(surfaceCount);
            return {
                erosion: healthBefore - layer.health,
                outerHealthAfter: layer.health,
                surfaceHits: surface.length,
                surfaceDamage: surface.reduce((sum, h) => sum + h.damage.amount, 0),
                penetrationHits: penetration.length,
                penetrationDamage: penetration.reduce((sum, h) => sum + h.damage.amount, 0),
            };
        },
    };
}

const REPORT_PATH = path.join(__dirname, 'armor-ammo-matrix-report.md');
const armorModelNames = Object.keys(armorModels) as ArmorModelName[];

describe('armor x ammo QA matrix (issue #2035)', () => {
    const matrix = buildArmorAmmoMatrix({
        armorModelNames,
        ammoTypes,
        ammoDesigns,
        createFixture,
    });
    const row = (armor: ArmorModelName, ammo: string) => matrix.rows.find((r) => r.armor === armor && r.ammo === ammo);

    it('accumulates damage across repeated shots on the same plate (regression: shots-to-breach must not silently re-roll a fresh plate)', () => {
        // composite vs ArmPenShell: plateDamage_ArmPen 2, flat 30 damage/shot against a
        // 100-health plate → exactly 2 shots to empty it
        expect(row('composite', 'ArmPenShell')?.applicationsToBreach).to.equal(2);
    });

    it('composite is Transparent to Elec: zero erosion but electronics take real damage', () => {
        const cell = row('composite', 'ElecMissile');
        expect(cell?.outcome).to.equal('Transparent');
        expect(cell?.erosion).to.equal(0);
        expect(cell?.penetrationHits).to.be.greaterThan(0);
        expect(cell?.penetrationDamage).to.be.greaterThan(0);
    });

    it('Frag never erodes any armor, and its surface scrape always lands', () => {
        const fragRows = matrix.rows.filter((r) => r.damageType === 'Frag');
        expect(fragRows.length).to.be.greaterThan(0);
        for (const r of fragRows) {
            expect(r.erosion, `${r.armor} x ${r.ammo} erosion`).to.equal(0);
            expect(r.surfaceDamage, `${r.armor} x ${r.ammo} surface scrape`).to.be.greaterThan(0);
        }
    });

    it('opens the penetration channel once a layer breaks (regression: post-breach behavior must be observed, not just the shots leading up to it)', () => {
        // composite vs ArmPenShell: plateDamage_ArmPen 2, flat 30 damage/shot against a 100-health
        // plate → breaches on the 2nd shot (60, then 120 clamped to 100); the 3rd shot lands on an
        // already-broken layer and must show the exposure chain fully open (penetration channel)
        const fixture = createFixture('composite');
        fixture.fire('ArmPen', 'impact', 30);
        const breaching = fixture.fire('ArmPen', 'impact', 30);
        expect(breaching.outerHealthAfter, 'plate should be broken by the 2nd shot').to.equal(0);
        const postBreach = fixture.fire('ArmPen', 'impact', 30);
        expect(
            postBreach.penetrationHits,
            'a broken layer must not keep blocking the penetration channel',
        ).to.be.greaterThan(0);
    });

    it('every observed value is finite and non-negative', () => {
        for (const r of matrix.rows) {
            for (const key of [
                'erosion',
                'surfaceHits',
                'surfaceDamage',
                'penetrationHits',
                'penetrationDamage',
            ] as const) {
                expect(Number.isFinite(r[key]), `${r.armor}/${r.ammo} ${key} finite`).to.equal(true);
                expect(r[key], `${r.armor}/${r.ammo} ${key}`).to.be.at.least(0);
            }
        }
    });

    it('committed report matches the generated one (UPDATE_ARMOR_MATRIX_REPORT=1 to regenerate)', () => {
        const report = matrixToMarkdown(matrix);
        if (process.env.UPDATE_ARMOR_MATRIX_REPORT) {
            fs.writeFileSync(REPORT_PATH, report);
        }
        const committed = fs.readFileSync(REPORT_PATH, 'utf8');
        expect(committed, 'committed report is stale — regenerate it').to.equal(report);
    });
});
