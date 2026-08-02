import {
    ArmorModelName,
    ProjectileDesign,
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
import { PLATE_MAX_HEALTH, buildArmorAmmoMatrix, matrixToMarkdown } from './armor-ammo-matrix-harness';

import { DamageManager } from '../src';
import { MockDie } from './ship-test-harness';
import { expect } from 'chai';
import fs from 'fs';
import path from 'path';

// a single plate's own angular slice (12 plates in dragonflyArmor → 30° each): the whole
// hit lands on exactly one plate, so `share` in the resolution walk is always 1
const SINGLE_PLATE_ARC: Tuple2 = [0, 1];

// the innermost armor layer must always be composite (make-ship-state's makeArmor contract);
// the tested model sits outermost with a generous composite backing so the outer layer's own
// health tracks its own response in isolation, mirroring armor-walk.spec.ts's *OverComposite rigs
function freshFixture(model: ArmorModelName) {
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
    const spaceManager = new SpaceManager();
    spaceManager.insert(ship);
    const damageManager = new DamageManager(ship, state, spaceManager, new MockDie());
    return { state, damageManager };
}

// one persistent plate per fixture: repeated fire() calls accumulate on the SAME plate, the
// way repeated real hits would — a fresh plate per shot would silently report every ammo type
// as unable to breach anything, since no single hit alone empties a 100-health plate
function createFixture(model: ArmorModelName) {
    const { state, damageManager } = freshFixture(model);
    const [, plate] = [...state.armor.platesInRange(SINGLE_PLATE_ARC)][0];
    const layer = plate.layers[0];
    return {
        fire(damageType: WeaponDamageType, delivery: 'impact' | 'explosion', amount: number): number {
            damageManager.takeWeaponDamage({
                id: 'qa-shot',
                amount,
                damageSurfaceArc: SINGLE_PLATE_ARC,
                damageDurationSeconds: 1,
                damageType,
                delivery,
                profile: damageProfiles[damageType],
            });
            return layer.health;
        },
    };
}

const REPORT_PATH = path.join(__dirname, 'armor-ammo-matrix-report.md');

describe('armor x ammo QA matrix (issue #2035)', () => {
    const matrix = buildArmorAmmoMatrix({ armorModels, ammoTypes, ammoDesigns, clusterWarheadModes, createFixture });

    it('accumulates damage across repeated shots on the same plate (regression: shots-to-breach must not silently re-roll a fresh plate)', () => {
        // composite vs TandemMissile: plateDamage_Tandem 1, penetration_Tandem 0, flat 50 damage/shot
        // against a 100-health plate → exactly 2 shots to empty it
        const row = matrix.rows.find((r) => r.armor === 'composite' && r.ammo === 'TandemMissile');
        expect(row?.shotsToBreach).to.equal(2);
    });

    it('exercises every registered armor layer type', () => {
        const modelsCovered = new Set(matrix.rows.map((r) => r.armor));
        expect([...modelsCovered].sort()).to.deep.equal(Object.keys(armorModels).sort());
    });

    it('exercises every ammo type (cluster missile counted once per selectable warhead)', () => {
        const ammoCovered = new Set(matrix.rows.map((r) => r.ammo));
        const expectedAmmoKeys = ammoTypes.flatMap((ammo) =>
            (ammoDesigns[ammo] as ProjectileDesign).warheads
                ? clusterWarheadModes.map((mode) => `${ammo}:${mode}`)
                : [ammo as string],
        );
        expect([...ammoCovered].sort()).to.deep.equal([...new Set(expectedAmmoKeys)].sort());
    });

    it('never produces a NaN, undefined or negative observed value', () => {
        for (const row of matrix.rows) {
            expect(Number.isFinite(row.damageDealt), `${row.armor}/${row.ammo} damageDealt finite`).to.equal(true);
            expect(row.damageDealt, `${row.armor}/${row.ammo} damageDealt`).to.be.at.least(0);
            if (row.shotsToBreach !== null) {
                expect(Number.isFinite(row.shotsToBreach), `${row.armor}/${row.ammo} shotsToBreach finite`).to.equal(
                    true,
                );
                expect(row.shotsToBreach, `${row.armor}/${row.ammo} shotsToBreach`).to.be.at.least(1);
            }
        }
    });

    it('writes a self-contained markdown report to disk', () => {
        const report = matrixToMarkdown(matrix);
        fs.writeFileSync(REPORT_PATH, report);
        expect(fs.existsSync(REPORT_PATH)).to.equal(true);
        for (const row of matrix.rows) {
            expect(report).to.include(row.armor);
            expect(report).to.include(row.ammo);
        }
    });
});
