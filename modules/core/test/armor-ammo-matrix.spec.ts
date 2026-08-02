import {
    ArmorModelName,
    AttackResolutionManager,
    SpaceManager,
    Spaceship,
    Tuple2,
    WeaponDamageType,
    ammoDesigns,
    ammoTypes,
    armorModels,
    clusterWarheadModes,
    damageProfiles,
    dragonflySF22,
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
// engages HiExp/ArmPen/Tandem — zeroing the exposure chain for every tested model and making
// the penetration channel unobservable. Pre-breaking the backing makes it transparent
// (broken → exposure 1), so what reaches the systems is governed solely by the tested layer.
function createFixture(model: ArmorModelName): Fixture {
    const ship = new Spaceship();
    ship.id = 'qa-armor-matrix-ship';
    const state = makeShipState(ship.id, {
        ...dragonflySF22,
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
    return {
        response: (damageType: WeaponDamageType) => layer.design.response(damageType),
        singleUsePlates: layer.design.singleUsePlates,
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
            });
            // both channels resolve to a uniform per-hit amount; the penetration channel's is
            // amount × systemDamageFactor (resolvePenetrationChannel), which never coincides
            // with the surface channel's scaled amount for any current profile
            const penetrationAmount = amount * profile.systemDamageFactor;
            const penetration = hits.filter((h) => h.damage.amount === penetrationAmount);
            const surface = hits.filter((h) => h.damage.amount !== penetrationAmount);
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
        clusterWarheadModes,
        createFixture,
    });
    const row = (armor: ArmorModelName, ammo: string) => matrix.rows.find((r) => r.armor === armor && r.ammo === ammo);

    it('accumulates damage across repeated shots on the same plate (regression: shots-to-breach must not silently re-roll a fresh plate)', () => {
        // composite vs TandemMissile: plateDamage_Tandem 1, flat 50 damage/shot against a
        // 100-health plate → exactly 2 shots to empty it
        expect(row('composite', 'TandemMissile')?.applicationsToBreach).to.equal(2);
    });

    it('reactive cells pop against impact ArmPen: defeated hit, no fabricated damage, regardless of amount', () => {
        const cell = row('reactive', 'ArmPenShell');
        expect(cell?.outcome).to.equal('Pops (defeats hit)');
        expect(cell?.popped).to.equal(true);
        expect(cell?.penetrationHits, 'a defeated hit must not reach systems').to.equal(0);
        // the pop is a rule effect, not damage: even a 5-point tap zeroes the cell and is defeated
        const tap = createFixture('reactive').fire('ArmPen', 'impact', 5);
        expect(tap.outerHealthAfter).to.equal(0);
        expect(tap.penetrationHits).to.equal(0);
    });

    it('Tandem pops the reactive cell AND continues to systems (penetration 1)', () => {
        const cell = row('reactive', 'TandemMissile');
        expect(cell?.outcome).to.equal('Pops (penetrated)');
        expect(cell?.penetrationDamage).to.be.greaterThan(0);
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

    it('whipple pre-detonates shaped charges: Tandem is Blocked outright', () => {
        const cell = row('whipple', 'TandemMissile');
        expect(cell?.outcome).to.equal('Blocked');
        expect(cell?.erosion).to.equal(0);
        expect(cell?.penetrationHits).to.equal(0);
    });

    it('hardened erodes at 2x under Tandem vs ArmPen at equal amounts (spec: the jet burns through double-speed)', () => {
        const tandem = createFixture('hardened').fire('Tandem', 'impact', 30);
        const armPen = createFixture('hardened').fire('ArmPen', 'impact', 30);
        expect(tandem.erosion).to.be.closeTo(armPen.erosion * 2, 0.01);
        expect(armPen.erosion).to.be.greaterThan(0);
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
