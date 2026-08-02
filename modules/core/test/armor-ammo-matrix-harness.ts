import {
    AmmoType,
    ArmorModelName,
    ArmorResponse,
    ClusterWarheadMode,
    ProjectileDesign,
    WeaponDamageType,
} from '../src';

/**
 * The three per-layer outcomes named by the design spec, plus the reactive-cell pop variant:
 * - Blocked: the round stops at this layer; deeper layers never see it. The armor defeated the hit.
 * - Transparent: the round passes through untouched to the next layer in.
 * - Engages: plates erode; damage continues inward scaled by the layer's exposure.
 * - Pops: single-use cells + impact delivery — the cell zeroes itself by rule and the hit is
 *   defeated (unless it fully penetrates); erosion is NOT a damage measurement on these rows.
 */
type CellOutcome = 'Blocked' | 'Transparent' | 'Engages' | 'Pops (defeats hit)' | 'Pops (penetrated)';

/** what a single application of a damage event was observed to do, across both channels */
export type Observation = {
    /** health lost on the tested (outer) layer; meaningless as a damage figure on pop rows */
    erosion: number;
    outerHealthAfter: number;
    surfaceHits: number;
    surfaceDamage: number;
    penetrationHits: number;
    penetrationDamage: number;
};

export type Fixture = {
    fire: (damageType: WeaponDamageType, delivery: 'impact' | 'explosion', amount: number) => Observation;
    response: (damageType: WeaponDamageType) => ArmorResponse;
    singleUsePlates: boolean;
};

type MatrixRow = {
    armor: ArmorModelName;
    ammo: string;
    damageType: WeaponDamageType;
    delivery: 'impact' | 'explosion';
    outcome: CellOutcome;
    /** raw, unclamped — validity is asserted by the spec, not sanitized here */
    erosion: number;
    /** applications on the same plate until the tested layer breaks; null = never (capped) */
    applicationsToBreach: number | null;
    popped: boolean;
    surfaceHits: number;
    surfaceDamage: number;
    penetrationHits: number;
    penetrationDamage: number;
    anomalies: string[];
};

type Matrix = { rows: MatrixRow[] };

const MAX_APPLICATIONS = 50;
export const PLATE_MAX_HEALTH = 100;

type AmmoRow = { key: string; damageType: WeaponDamageType; delivery: 'impact' | 'explosion'; amount: number };

function rowsForAmmo(
    ammo: AmmoType,
    design: ProjectileDesign,
    clusterWarheadModes: readonly ClusterWarheadMode[],
): AmmoRow[] {
    if (design.warheads) {
        return clusterWarheadModes.map((mode) => {
            const warhead = design.warheads![mode];
            return {
                key: `${ammo}:${mode}`,
                damageType: warhead.damageType,
                delivery: warhead.delivery,
                amount: warhead.delivery === 'impact' ? warhead.damage : warhead.explosion.damageFactor,
            };
        });
    }
    return [
        {
            key: ammo,
            damageType: design.damageType,
            delivery: design.delivery,
            amount: design.delivery === 'impact' ? design.damage : design.explosion.damageFactor,
        },
    ];
}

function classify(response: ArmorResponse, singleUsePlates: boolean, delivery: 'impact' | 'explosion'): CellOutcome {
    if (response.kind === 'block') {
        return 'Blocked';
    }
    if (response.kind === 'bypass') {
        return 'Transparent';
    }
    if (singleUsePlates && delivery === 'impact') {
        return response.penetration >= 1 ? 'Pops (penetrated)' : 'Pops (defeats hit)';
    }
    return 'Engages';
}

function invalid(v: number): boolean {
    return !Number.isFinite(v) || v < 0;
}

/** observation-vs-classification cross-checks: things a human should actually look at */
function findAnomalies(outcome: CellOutcome, first: Observation): string[] {
    const anomalies: string[] = [];
    for (const [name, v] of Object.entries(first)) {
        if (invalid(v)) {
            anomalies.push(`invalid observed value: ${name} = ${v}`);
        }
    }
    switch (outcome) {
        case 'Blocked':
            if (first.erosion !== 0) {
                anomalies.push(`Blocked layer eroded (${first.erosion.toFixed(2)})`);
            }
            if (first.penetrationHits > 0) {
                anomalies.push(
                    `Blocked hit reached ${first.penetrationHits} system(s) through the penetration channel`,
                );
            }
            break;
        case 'Transparent':
            if (first.erosion !== 0) {
                anomalies.push(`Transparent layer eroded (${first.erosion.toFixed(2)})`);
            }
            if (first.penetrationHits === 0) {
                anomalies.push('round passes through Transparent armor but no system took damage');
            }
            break;
        case 'Engages':
            if (first.erosion === 0) {
                anomalies.push('layer classified as Engages but no plate erosion observed');
            }
            break;
        case 'Pops (defeats hit)':
            if (first.outerHealthAfter !== 0) {
                anomalies.push('impact on single-use cells did not pop them');
            }
            if (first.penetrationHits > 0) {
                anomalies.push('defeated (popped) hit still reached systems through the penetration channel');
            }
            break;
        case 'Pops (penetrated)':
            if (first.outerHealthAfter !== 0) {
                anomalies.push('impact on single-use cells did not pop them');
            }
            if (first.penetrationHits === 0) {
                anomalies.push('fully-penetrating round popped the cell but no system took damage');
            }
            break;
    }
    return anomalies;
}

export function buildArmorAmmoMatrix({
    armorModelNames,
    ammoTypes,
    ammoDesigns,
    clusterWarheadModes,
    createFixture,
}: {
    armorModelNames: readonly ArmorModelName[];
    ammoTypes: readonly AmmoType[];
    ammoDesigns: Record<AmmoType, ProjectileDesign>;
    clusterWarheadModes: readonly ClusterWarheadMode[];
    createFixture: (model: ArmorModelName) => Fixture;
}): Matrix {
    const ammoRows = ammoTypes.flatMap((ammo) => rowsForAmmo(ammo, ammoDesigns[ammo], clusterWarheadModes));
    const rows: MatrixRow[] = [];
    for (const modelName of armorModelNames) {
        for (const ammoRow of ammoRows) {
            const fixture = createFixture(modelName);
            const outcome = classify(fixture.response(ammoRow.damageType), fixture.singleUsePlates, ammoRow.delivery);
            const popped = outcome === 'Pops (defeats hit)' || outcome === 'Pops (penetrated)';

            // every application below lands on the same plate, accumulating like repeated real fire
            const first = fixture.fire(ammoRow.damageType, ammoRow.delivery, ammoRow.amount);

            let applicationsToBreach: number | null = null;
            if (first.outerHealthAfter <= 0) {
                applicationsToBreach = 1;
            } else if (first.erosion > 0) {
                let applications = 1;
                let health = first.outerHealthAfter;
                while (health > 0 && applications < MAX_APPLICATIONS) {
                    health = fixture.fire(ammoRow.damageType, ammoRow.delivery, ammoRow.amount).outerHealthAfter;
                    applications++;
                }
                applicationsToBreach = health <= 0 ? applications : null;
            }

            rows.push({
                armor: modelName,
                ammo: ammoRow.key,
                damageType: ammoRow.damageType,
                delivery: ammoRow.delivery,
                outcome,
                erosion: first.erosion,
                applicationsToBreach,
                popped,
                surfaceHits: first.surfaceHits,
                surfaceDamage: first.surfaceDamage,
                penetrationHits: first.penetrationHits,
                penetrationDamage: first.penetrationDamage,
                anomalies: findAnomalies(outcome, first),
            });
        }
    }
    return { rows };
}

function channelCell(hits: number, damage: number): string {
    return hits === 0 ? '—' : `${hits} / ${damage.toFixed(2)}`;
}

function tableFor(rows: MatrixRow[], breachHeader: string): string[] {
    const lines: string[] = [];
    lines.push(
        `| Armor | Ammo | Type | Outcome | Plate erosion (1st) | ${breachHeader} | Surface hits / dmg | Penetration hits / dmg | Anomalies |`,
    );
    lines.push('|---|---|---|---|---|---|---|---|---|');
    for (const row of rows) {
        const erosion = row.popped ? '— (cell popped, not damage)' : row.erosion.toFixed(2);
        const breach = row.popped
            ? '1 (pop)'
            : row.erosion === 0
              ? 'n/a (no erosion)'
              : (row.applicationsToBreach ?? `> ${MAX_APPLICATIONS}`);
        lines.push(
            `| ${row.armor} | ${row.ammo} | ${row.damageType} | ${row.outcome} | ${erosion} | ${breach} | ${channelCell(row.surfaceHits, row.surfaceDamage)} | ${channelCell(row.penetrationHits, row.penetrationDamage)} | ${row.anomalies.join('; ') || '—'} |`,
        );
    }
    return lines;
}

export function matrixToMarkdown(matrix: Matrix): string {
    const flagged = matrix.rows.filter((r) => r.anomalies.length > 0);
    const impact = matrix.rows.filter((r) => r.delivery === 'impact');
    const explosion = matrix.rows.filter((r) => r.delivery === 'explosion');
    const lines: string[] = [];
    lines.push('# Armor x Ammo QA Matrix');
    lines.push('');
    lines.push(
        'Generated by `modules/core/test/armor-ammo-matrix.spec.ts`. `npm test` verifies this file is in sync; to regenerate after a balance/model change run `UPDATE_ARMOR_MATRIX_REPORT=1 npm test -- modules/core/test/armor-ammo-matrix.spec.ts`. Do not hand-edit.',
    );
    lines.push('');
    lines.push('## How to read this');
    lines.push('');
    lines.push('Each cell classifies the armor layer response (from `ArmorLayerDesignState.response()`):');
    lines.push('');
    lines.push('- **Blocked** — the round stops at this layer; the armor defeated the hit.');
    lines.push('- **Transparent** — the round passes through untouched; systems behind take full damage.');
    lines.push('- **Engages** — plates erode; damage leaks inward through penetration/broken sections.');
    lines.push(
        '- **Pops** — reactive single-use cells vs impact delivery: one cell zeroes itself by rule and the hit is defeated (exposure measured pre-pop), unless the round fully penetrates (Tandem). The erosion column on these rows is a rule effect, not a damage measurement — no damage figure exists for a pop.',
    );
    lines.push('');
    lines.push(
        'The surface channel (HiExp/Frag scrape on hull-mounted systems) bypasses the armor walk entirely — a Blocked outcome with surface damage is normal, not a leak. Zero plate erosion is one of the three normal outcomes, not an anomaly.',
    );
    lines.push('');
    lines.push('## Methodology and scope');
    lines.push('');
    lines.push(
        `Rig: a single plate whose outer layer is the tested model (${PLATE_MAX_HEALTH} health, the dragonfly-SF22 baseline) over a composite backing layer that is pre-broken, so observed system damage is governed solely by the tested layer (\`makeArmor\` requires a composite innermost layer; an intact one engages HiExp/ArmPen/Tandem and would zero the chain for every model). Each application drives \`AttackResolutionManager.resolveWeaponAttack\` — the exact resolution path a real hit takes — and records plate erosion plus resolved system hits on both channels. Resolved damage amounts are recorded pre-defect-roll; defects and system breakage are out of scope.`,
    );
    lines.push('');
    lines.push(
        "**Impact and explosion tables are not comparable to each other.** Impact rows apply the warhead's real per-hit `damage`. Real explosion damage accrues per tick as `damageFactor × dt × overlap` over the cloud's lifetime (geometry-dependent); explosion rows here apply one nominal application of `damageFactor × 1s × 1m overlap`, which exercises the armor response but is not a per-shot damage figure. The tables are split so the numbers are not read side by side.",
    );
    lines.push('');

    if (flagged.length > 0) {
        lines.push(`## ⚠ ${flagged.length} anomal${flagged.length === 1 ? 'y' : 'ies'} flagged`);
        lines.push('');
        for (const row of flagged) {
            lines.push(`- **${row.armor} x ${row.ammo}**: ${row.anomalies.join('; ')}`);
        }
    } else {
        lines.push('## No anomalies flagged');
        lines.push('');
        lines.push(
            'Every cell behaved as its classification predicts: Blocked cells stopped the round, Transparent cells passed it to systems, Engaging cells eroded, pops defeated (or were penetrated by) exactly the rounds the spec says.',
        );
    }
    lines.push('');
    lines.push('## Impact ammo (real per-hit damage)');
    lines.push('');
    lines.push(...tableFor(impact, 'Shots to breach'));
    lines.push('');
    lines.push('## Explosion ammo (nominal 1s × 1m application of `damageFactor` — not per-shot damage)');
    lines.push('');
    lines.push(...tableFor(explosion, 'Applications to breach'));
    lines.push('');
    return lines.join('\n');
}
