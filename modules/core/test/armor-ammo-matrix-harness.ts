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
    factors: (damageType: WeaponDamageType) => { plateDamageFactor: number; penetrationFactor: number };
    singleUsePlates: boolean;
};

type MatrixRow = {
    armor: ArmorModelName;
    ammo: string;
    damageType: WeaponDamageType;
    delivery: 'impact' | 'explosion';
    outcome: CellOutcome;
    plateDamageFactor: number;
    penetrationFactor: number;
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

/**
 * Design-spec rule, reproduced verbatim (the design repo is unreachable from here — see
 * modules/core/test/armor-ammo-matrix.spec.ts's header comment for the source quotation):
 * a *deflecting* armor model (currently only Reactive) cancels the surface scrape of a
 * *deflectable* damage type — every type except Tandem (its precursor defeats the deflection)
 * and Frag (a cloud is not a round, nothing to push away) — but only while the deflecting layer
 * is the outermost INTACT layer in the hit arc. This property (`deflectsSurfaceEffect`) does not
 * exist in `ArmorModelStats` or `resolveWeaponAttack` — see the "Deflection" section of the
 * generated report for what that means for the anomaly count below.
 */
const DEFLECTING_ARMOR_MODELS: readonly ArmorModelName[] = ['reactive'];
const NON_DEFLECTABLE_TYPES: readonly WeaponDamageType[] = ['Tandem', 'Frag'];

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

function invalidValueAnomalies(obs: Observation): string[] {
    const anomalies: string[] = [];
    for (const [name, v] of Object.entries(obs)) {
        if (invalid(v)) {
            anomalies.push(`invalid observed value: ${name} = ${v}`);
        }
    }
    return anomalies;
}

/** invariants that must hold on every hit while the tested layer is still intact going in */
function intactAnomalies(
    outcome: CellOutcome,
    armor: ArmorModelName,
    damageType: WeaponDamageType,
    obs: Observation,
): string[] {
    const anomalies = invalidValueAnomalies(obs);
    switch (outcome) {
        case 'Blocked':
            if (obs.erosion !== 0) {
                anomalies.push(`Blocked layer eroded (${obs.erosion.toFixed(2)})`);
            }
            if (obs.penetrationHits > 0) {
                anomalies.push(`Blocked hit reached ${obs.penetrationHits} system(s) through the penetration channel`);
            }
            break;
        case 'Transparent':
            if (obs.erosion !== 0) {
                anomalies.push(`Transparent layer eroded (${obs.erosion.toFixed(2)})`);
            }
            if (obs.penetrationHits === 0) {
                anomalies.push('round passes through Transparent armor but no system took damage');
            }
            break;
        case 'Engages':
            if (obs.erosion === 0) {
                anomalies.push('layer classified as Engages but no plate erosion observed');
            }
            break;
        case 'Pops (defeats hit)':
            if (obs.outerHealthAfter !== 0) {
                anomalies.push('impact on single-use cells did not pop them');
            }
            if (obs.penetrationHits > 0) {
                anomalies.push('defeated (popped) hit still reached systems through the penetration channel');
            }
            break;
        case 'Pops (penetrated)':
            if (obs.outerHealthAfter !== 0) {
                anomalies.push('impact on single-use cells did not pop them');
            }
            if (obs.penetrationHits === 0) {
                anomalies.push('fully-penetrating round popped the cell but no system took damage');
            }
            break;
    }
    const deflecting = DEFLECTING_ARMOR_MODELS.includes(armor);
    const deflectable = !NON_DEFLECTABLE_TYPES.includes(damageType);
    if (deflecting && deflectable && (obs.surfaceHits > 0 || obs.surfaceDamage > 0)) {
        anomalies.push(
            `deflection gap: ${armor} is specced to deflect ${damageType}'s surface scrape while intact ` +
                `(deflectsSurfaceEffect), but observed ${obs.surfaceHits} surface hit(s) / ${obs.surfaceDamage.toFixed(2)} dmg — ` +
                'this property is not implemented in ArmorModelStats/resolveWeaponAttack (src gap, tracked separately, not a regression in this harness)',
        );
    }
    return anomalies;
}

/** the layer just broke (erosion breach) or popped — the exposure chain should now be fully open */
function postBreachAnomalies(outcome: CellOutcome, obs: Observation): string[] {
    const anomalies = invalidValueAnomalies(obs);
    const opensPenetration =
        outcome === 'Engages' || outcome === 'Pops (defeats hit)' || outcome === 'Pops (penetrated)';
    if (opensPenetration && obs.penetrationHits === 0 && obs.surfaceHits === 0) {
        anomalies.push(
            'broken/popped layer still blocks all system damage — expected the exposure chain to fully open ' +
                '(max(penetration, broken) = 1) once the layer is down, but this application produced neither a surface nor a penetration hit',
        );
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
            const { plateDamageFactor, penetrationFactor } = fixture.factors(ammoRow.damageType);

            const anomalies = new Set<string>();
            const record = (found: string[]) => found.forEach((a) => anomalies.add(a));

            // every application below lands on the same plate, accumulating like repeated real fire
            const first = fixture.fire(ammoRow.damageType, ammoRow.delivery, ammoRow.amount);
            record(intactAnomalies(outcome, modelName, ammoRow.damageType, first));

            let applicationsToBreach: number | null = null;
            if (first.outerHealthAfter <= 0) {
                applicationsToBreach = 1;
            } else if (first.erosion > 0) {
                let applications = 1;
                let health = first.outerHealthAfter;
                while (health > 0 && applications < MAX_APPLICATIONS) {
                    const obs = fixture.fire(ammoRow.damageType, ammoRow.delivery, ammoRow.amount);
                    record(intactAnomalies(outcome, modelName, ammoRow.damageType, obs));
                    health = obs.outerHealthAfter;
                    applications++;
                }
                applicationsToBreach = health <= 0 ? applications : null;
            }

            // the intact→broken transition is the interesting state change: one more hit against
            // the now-broken/popped layer, checked against a different invariant (channel open)
            if (applicationsToBreach !== null) {
                const postBreach = fixture.fire(ammoRow.damageType, ammoRow.delivery, ammoRow.amount);
                record(postBreachAnomalies(outcome, postBreach));
            }

            rows.push({
                armor: modelName,
                ammo: ammoRow.key,
                damageType: ammoRow.damageType,
                delivery: ammoRow.delivery,
                outcome,
                plateDamageFactor,
                penetrationFactor,
                erosion: first.erosion,
                applicationsToBreach,
                popped,
                surfaceHits: first.surfaceHits,
                surfaceDamage: first.surfaceDamage,
                penetrationHits: first.penetrationHits,
                penetrationDamage: first.penetrationDamage,
                anomalies: [...anomalies],
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
        `| Armor | Ammo | Type | Outcome | plateDamage | penetration | Plate erosion (1st) | ${breachHeader} | Surface hits / dmg | Penetration hits / dmg | Anomalies |`,
    );
    lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
    for (const row of rows) {
        const erosion = row.popped ? '— (cell popped, not damage)' : row.erosion.toFixed(2);
        const breach = row.popped
            ? '1 (pop)'
            : row.erosion === 0
              ? 'n/a (no erosion)'
              : (row.applicationsToBreach ?? `> ${MAX_APPLICATIONS}`);
        lines.push(
            `| ${row.armor} | ${row.ammo} | ${row.damageType} | ${row.outcome} | ${row.plateDamageFactor} | ${row.penetrationFactor} | ${erosion} | ${breach} | ${channelCell(row.surfaceHits, row.surfaceDamage)} | ${channelCell(row.penetrationHits, row.penetrationDamage)} | ${row.anomalies.join('; ') || '—'} |`,
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
    lines.push(
        'Each cell classifies the armor layer response (from `ArmorLayerDesignState.response()`), and lists the underlying `plateDamage` / `penetration` factors it was classified from:',
    );
    lines.push('');
    lines.push('- **Blocked** — the round stops at this layer; the armor defeated the hit.');
    lines.push('- **Transparent** — the round passes through untouched; systems behind take full damage.');
    lines.push('- **Engages** — plates erode; damage leaks inward through penetration/broken sections.');
    lines.push(
        '- **Pops** — reactive single-use cells vs impact delivery: one cell zeroes itself by rule and the hit is defeated (exposure measured pre-pop), unless the round fully penetrates (Tandem). The erosion column on these rows is a rule effect, not a damage measurement — no damage figure exists for a pop.',
    );
    lines.push('');
    lines.push(
        'The surface channel (HiExp/Frag scrape on hull-mounted systems) bypasses the armor walk entirely — a Blocked outcome with surface damage is normal, not a leak. Zero plate erosion is one of the normal outcomes, not by itself an anomaly.',
    );
    lines.push('');
    lines.push(
        "**Checked, per cell:** every pre-breach application (not just the first) is checked against its classification's invariant (erosion present/absent, penetration channel present/absent, pop occurred); once a layer breaks or a cell pops, one further application checks that the exposure chain opened (penetration or surface damage now lands). **Not checked:** erosion *magnitude* against the `plateDamage` factor — e.g. that hardened's Tandem row erodes at exactly 2× its ArmPen row. That relationship is pinned by a dedicated regression test in the spec file, not by this generic scan, so a magnitude-only regression would not appear as an anomaly here.",
    );
    lines.push('');
    lines.push('## Deflection (design spec vs. code — see scope note below)');
    lines.push('');
    lines.push(
        'The design spec defines **deflection**: a deflecting armor (Reactive) pushes an incoming round away before its blast develops, cancelling the surface scrape — for every damage type except Tandem (its precursor defeats the deflection) and Frag (a cloud cannot be pushed away) — but only while the deflecting layer is the outermost **intact** layer in the hit arc. The armor-identity writeup sells this as part of Reactive\'s specialty ("deflects HiExp scrape").',
    );
    lines.push('');
    lines.push(
        '`deflectsSurfaceEffect` does not exist in `ArmorModelStats`, and `resolveWeaponAttack` applies the surface channel unconditionally, before the armor walk runs. This sweep encodes the spec rule directly (Reactive deflects HiExp/ArmPen/Elec, not Tandem/Frag) and flags any cell that violates it as a **deflection gap** anomaly below — currently every Reactive × HiExp cell, since ArmPen and Elec have no surface effect to deflect in the first place and so cannot expose the gap. Fixing this is a `src`-level change and out of scope for this harness; the flag exists so the gap stays visible instead of reading as "no anomalies" until it is fixed.',
    );
    lines.push('');
    lines.push(
        '**Scope note:** because of this rule, "0 anomalies flagged" on a future run does not mean "the code is internally self-consistent" — it means "the code matches the design spec at every checked cell", which is the stronger and correct claim for a QA tool, but a different one than earlier revisions of this report made.',
    );
    lines.push('');
    lines.push('## Methodology and scope');
    lines.push('');
    lines.push(
        `Rig: a single plate whose outer layer is the tested model (${PLATE_MAX_HEALTH} health, the demo-ship baseline) over a composite backing layer that is pre-broken, so observed system damage is governed solely by the tested layer (\`makeArmor\` requires a composite innermost layer; an intact one engages HiExp/ArmPen/Tandem and would zero the chain for every model). Each application drives \`AttackResolutionManager.resolveWeaponAttack\` — the exact resolution path a real hit takes — and records plate erosion plus resolved system hits on both channels, split structurally using the documented "surface hits first, then penetration hits" ordering (not by comparing damage amounts). Resolved damage amounts are recorded pre-defect-roll; defects and system breakage are out of scope.`,
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
            'Every checked invariant held at every checked application — see "Checked, per cell" above for exactly what that covers, and the scope note above for what "0 anomalies" does and does not claim.',
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
