/**
 * Matched-seed validation of the helms score. Reads crew training runs made with `npm run train` on the
 * same seeds, one crew per helms policy (crews `helms-<policy>.json`; the other seats are the reference),
 * and prints a markdown report.
 *
 *   npm --prefix modules/ai run score:helms -- --runs <train out dir> [--runs <dir> ...] [--fit-max-seed 8]
 *       [--held-scenario T1-predator] [--evasion-weight 1] [--max-seed N] [--label name] [--out report.md]
 *
 * Every table compares the score against what the game did: the graded outcome of a run (hostile integrity
 * dealt minus own integrity lost; a kill counts 1), over the stretch of game time two runs share, so a run that
 * wins early is never averaged against another's calm tail. Splits are by seed (`--fit-max-seed`: seeds up to it
 * are fit seeds, the rest held out) and by scenario (`--held-scenario` is never fitted; the leave-one-scenario-out
 * table refits on the others). Each run's observations are cached beside its recording as `<run>.hkpi2.json`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { FEATURE_NAMES, extractFeatures, findDuel, integrity } from './features';
import {
    HELMS_SHAPE,
    HELMS_WEIGHTS,
    HelmsComponents,
    HelmsObservation,
    HelmsShape,
    HelmsWeights,
    TERMS,
    helmsComponents,
    observeHelms,
    termsOf,
} from './helms-kpi';
import { MomentPoint, RankedPair, bootstrap, ci, fmt, mean, rankingValidity, rng, seedCorr } from './validate-stats';
import { evaluate, featureSelector } from './model';
import { readEvents, readFrames } from './recording';

import { RecordingEventLine } from '@starwards/core/internal';
import { scorers } from './score';

function args(name: string) {
    return process.argv.flatMap((a, i) => (a === `--${name}` ? [process.argv[i + 1]] : []));
}

const PLAYER = 'GVTS';
/** `--shape bandDecay=6000,aimDecay=800`: the position term's geometry, for experiments on fit seeds. */
const SHAPE: HelmsShape = {
    ...HELMS_SHAPE,
    ...Object.fromEntries(
        (args('shape')[0] ?? '')
            .split(',')
            .filter(Boolean)
            .map((kv) => [kv.split('=')[0], Number(kv.split('=')[1])]),
    ),
};
const POLICIES = ['reference', 'idle', 'close-in', 'no-weave', 'far-off', 'charge', 'random'] as const;
type PolicyName = (typeof POLICIES)[number];

/** What the learned heads of the earlier artefacts say about the frame. */
interface Heads {
    readonly v1: number | null;
    readonly v2: number | null;
    readonly v3: number | null;
    readonly opportunity: number | null;
}

interface Frame {
    readonly c: HelmsComponents;
    readonly alive: boolean;
    /** Mean integrity of the hostiles of the first frame; 0 once destroyed or gone. */
    readonly hostile: number;
    readonly heads: Heads;
}

/**
 * What a recording is read down to, cached beside it as `<run>.hkpi2.json`: the observations, the sidecar events the
 * score reads and the outcome columns. The terms are computed from it on load, so a change to them needs no replay;
 * a change to `observeHelms` needs the version in the cache name bumped.
 */
interface CachedRun {
    readonly observations: readonly HelmsObservation[];
    readonly events: readonly RecordingEventLine[];
    readonly extras: readonly { readonly alive: boolean; readonly hostile: number; readonly heads: Heads }[];
    readonly end: number;
    readonly lost: boolean;
}

interface Run {
    readonly frames: readonly Frame[];
    readonly end: number;
    readonly lost: boolean;
    readonly scenario: string;
    readonly seed: number;
    readonly policy: PolicyName;
    readonly killed: boolean;
}

const selectors = {
    v1: featureSelector(scorers.v1, FEATURE_NAMES),
    v2: featureSelector(scorers.v2, FEATURE_NAMES),
    v3: featureSelector(scorers.v3, FEATURE_NAMES),
};

/** Sidecar events the score reads: rounds fired, hits and damage taken. */
const READ_KINDS = new Set(['shot', 'blast_hit', 'damage']);

async function loadRun(sgr: string): Promise<Omit<Run, 'scenario' | 'seed' | 'policy' | 'killed'>> {
    const cache = sgr.replace(/\.sgr$/, '.hkpi2.json');
    const cached = fs.existsSync(cache)
        ? (JSON.parse(fs.readFileSync(cache, 'utf8')) as CachedRun)
        : await readRun(sgr, cache);
    const cs = helmsComponents(cached.observations, cached.events, PLAYER, SHAPE);
    return {
        frames: cs.map((c, i) => ({ c, ...cached.extras[i] })),
        end: cached.end,
        lost: cached.lost,
    };
}

async function readRun(sgr: string, cache: string): Promise<CachedRun> {
    const recorded = await readFrames(sgr);
    const first = recorded[0]?.saved.fragment.space;
    const faction = first?.getShip(PLAYER)?.faction;
    const hostiles = first ? [...first.getAll('Spaceship')].filter((s) => s.faction !== faction).map((s) => s.id) : [];
    const seen = recorded.flatMap((f) => {
        const o = observeHelms(f.t, f.saved, PLAYER);
        if (!o) return [];
        const alive = [...f.saved.fragment.space.getAll('Spaceship')].some((s) => s.id !== PLAYER && !s.destroyed);
        const hostile = hostiles.length
            ? hostiles.reduce((sum, id) => {
                  const ship = f.saved.fragment.ship.get(id);
                  const body = f.saved.fragment.space.getShip(id);
                  return sum + (ship && body && !body.destroyed ? integrity(ship) : 0);
              }, 0) / hostiles.length
            : 0;
        const duel = findDuel(f.saved, PLAYER);
        const x = duel ? extractFeatures(duel) : undefined;
        const head = (v: 'v1' | 'v2' | 'v3', label: string) =>
            x ? evaluate(scorers[v].models[label], selectors[v](x)) : null;
        const heads: Heads = {
            v1: head('v1', 'helms10'),
            v2: head('v2', 'helms10'),
            v3: head('v3', 'helms10'),
            opportunity: head('v3', 'opportunity45'),
        };
        return [{ o, alive, hostile, heads }];
    });
    const run: CachedRun = {
        observations: seen.map((s) => s.o),
        events: readEvents(sgr).filter((e) => READ_KINDS.has(e.kind)),
        extras: seen.map((s) => ({ alive: s.alive, hostile: s.hostile, heads: s.heads })),
        end: recorded.at(-1)?.t ?? 0,
        lost: seen.length < recorded.length,
    };
    fs.writeFileSync(cache, JSON.stringify(run));
    return run;
}

const crewReports = new Map<string, { crew: string; seed: number; killed: boolean }[]>();

function crewResults(dir: string, scenario: string) {
    const file = path.join(dir, `${scenario}-crews.json`);
    let results = crewReports.get(file);
    if (!results) {
        results = fs.existsSync(file)
            ? (JSON.parse(fs.readFileSync(file, 'utf8')) as { crew: string; seed: number; killed: boolean }[])
            : [];
        crewReports.set(file, results);
    }
    return results;
}

async function loadRuns(dirs: readonly string[]) {
    const runs: Run[] = [];
    for (const dir of dirs) {
        for (const crew of fs.readdirSync(dir)) {
            const policy = crew.replace(/^helms-/, '') as PolicyName;
            if (!crew.startsWith('helms-') || !POLICIES.includes(policy)) continue;
            for (const file of fs.readdirSync(path.join(dir, crew)).filter((f) => f.endsWith('.sgr'))) {
                const [, scenario, seed] = /^(.+)_seed(\d+)\.sgr$/.exec(file) ?? [];
                if (!scenario) continue;
                const loaded = await loadRun(path.join(dir, crew, file));
                const result = crewResults(dir, scenario).find((r) => r.crew === crew && r.seed === Number(seed));
                runs.push({ scenario, seed: Number(seed), policy, ...loaded, killed: !!result?.killed });
                process.stderr.write('.');
            }
        }
    }
    process.stderr.write('\n');
    return runs;
}

/** The score variants the report compares. */
const VARIANTS = [
    'helms',
    'position-only',
    'evasion-only',
    'helms10-v1',
    'helms10-v2',
    'helms10-v3',
    'tactical-opportunity',
] as const;
type Variant = (typeof VARIANTS)[number];

interface Parts {
    num: number;
    den: number;
}

/** Numerator and denominator one frame adds to a run's score: demand-weighted for the rule, one frame's worth for a head. */
function frameParts(f: Frame, variant: Variant, w: HelmsWeights): Parts {
    switch (variant) {
        case 'helms':
        case 'position-only':
        case 'evasion-only': {
            const only = variant === 'position-only' ? 'position' : variant === 'evasion-only' ? 'evasion' : undefined;
            let num = 0;
            let den = 0;
            const terms = termsOf(f.c, w);
            for (const name of TERMS) {
                if (only && name !== only) continue;
                const { d, s } = terms[name];
                num += w[name] * d * s;
                den += w[name] * d;
            }
            return { num, den };
        }
        case 'helms10-v1':
            return f.heads.v1 === null ? { num: 0, den: 0 } : { num: f.heads.v1, den: 1 };
        case 'helms10-v2':
            return f.heads.v2 === null ? { num: 0, den: 0 } : { num: f.heads.v2, den: 1 };
        case 'helms10-v3':
            return f.heads.v3 === null ? { num: 0, den: 0 } : { num: f.heads.v3, den: 1 };
        case 'tactical-opportunity':
            return f.heads.opportunity === null ? { num: 0, den: 0 } : { num: f.heads.opportunity, den: 1 };
    }
}

/** A run's score over its first `until` seconds, `NaN` when nothing was demanded. */
function runScore(run: Run, variant: Variant, w: HelmsWeights, until = Infinity) {
    let num = 0;
    let den = 0;
    for (const f of run.frames) {
        if (f.c.t > until) break;
        const p = frameParts(f, variant, w);
        num += p.num;
        den += p.den;
    }
    return den > 1e-9 ? num / den : NaN;
}

/** Seconds until own integrity fell below half, or the pair's common end. */
const SURVIVAL_INTEGRITY = 0.5;
/** Graded outcome gaps below this count as a tie. */
const TIE = 0.02;

interface Outcome {
    readonly graded: number;
    readonly lost: number;
    readonly survival: number;
}

function outcomeOver(run: Run, until: number): Outcome {
    const within = run.frames.filter((f) => f.c.t <= until);
    const first = run.frames[0];
    const last = within.at(-1) ?? first;
    return {
        graded: first.hostile - last.hostile - (first.c.integrity - last.c.integrity),
        lost: first.c.integrity - last.c.integrity,
        survival: within.find((f) => f.c.integrity < SURVIVAL_INTEGRITY)?.c.t ?? until,
    };
}

const key = (r: Run) => `${r.scenario}/${r.seed}`;

function groupBySeed(runs: readonly Run[]) {
    const out = new Map<string, Run[]>();
    for (const r of runs) out.set(key(r), [...(out.get(key(r)) ?? []), r]);
    return out;
}

/** Every pair of policies on one scenario and seed over their common time: the score gap and the graded gap, ties dropped. */
function rankedPairs(runs: readonly Run[], variant: Variant, w: HelmsWeights): Map<string, RankedPair[]> {
    const out = new Map<string, RankedPair[]>();
    for (const [k, group] of groupBySeed(runs)) {
        const scenario = k.split('/')[0];
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const [a, b] = [group[i], group[j]];
                if (!a.frames.length || !b.frames.length) continue;
                const until = Math.min(a.end, b.end);
                const x = runScore(a, variant, w, until) - runScore(b, variant, w, until);
                const y = outcomeOver(a, until).graded - outcomeOver(b, until).graded;
                if (!Number.isFinite(x) || Math.abs(y) < TIE) continue;
                out.set(scenario, [...(out.get(scenario) ?? []), { seed: a.seed, x, y }]);
            }
        }
    }
    return out;
}

function validityOf(runs: readonly Run[], variant: Variant, w: HelmsWeights, scenario?: string) {
    const by = rankedPairs(runs, variant, w);
    return rankingValidity(scenario ? (by.get(scenario) ?? []) : [...by.values()].flat());
}

const rv = (v: ReturnType<typeof rankingValidity>) =>
    v.n >= 5 ? `${fmt(v.r, 2)} [${fmt(v.lo, 2)}, ${fmt(v.hi, 2)}] / ${fmt(v.sign, 2)}` : '–';

interface PairRow {
    readonly score: number;
    readonly graded: number;
    readonly lost: number;
    readonly survival: number;
    readonly kill: number;
}

/** Paired deltas of `a` minus `b` per scenario and seed over the pair's common time; positive is better for `a` on every column. */
function pairedRows(runs: readonly Run[], a: PolicyName, b: PolicyName, variant: Variant, w: HelmsWeights): PairRow[] {
    const by = new Map(runs.map((r) => [`${key(r)}/${r.policy}`, r]));
    const rows: PairRow[] = [];
    for (const x of runs.filter((r) => r.policy === a)) {
        const y = by.get(`${key(x)}/${b}`);
        if (!y || !x.frames.length || !y.frames.length) continue;
        const until = Math.min(x.end, y.end);
        const score = runScore(x, variant, w, until) - runScore(y, variant, w, until);
        if (!Number.isFinite(score)) continue;
        const [ox, oy] = [outcomeOver(x, until), outcomeOver(y, until)];
        rows.push({
            score,
            graded: ox.graded - oy.graded,
            lost: oy.lost - ox.lost,
            survival: ox.survival - oy.survival,
            kill: Number(x.killed) - Number(y.killed),
        });
    }
    return rows;
}

const col = (rows: readonly PairRow[], f: (r: PairRow) => number) => bootstrap(rows.map(f));

/** Policy contrasts: the score gap against the game's outcome gap. */
const CONTRASTS: readonly (readonly [PolicyName, PolicyName])[] = [
    ['reference', 'idle'],
    ['reference', 'random'],
    ['reference', 'charge'],
    ['reference', 'close-in'],
    ['reference', 'no-weave'],
    ['reference', 'far-off'],
    ['idle', 'random'],
];

/**
 * Where the game's graded outcome separates the pair (CI excludes 0), the score must order them the same way:
 * ✓ ordered the same way with a CI that excludes 0, ✗ ordered the other way (CI excludes 0), ~ spans 0.
 */
function verdict(rows: readonly PairRow[]) {
    const outcome = col(rows, (r) => r.graded);
    if (outcome.n < 2 || (outcome.lo <= 0 && outcome.hi >= 0)) return 'outcome ties';
    const score = col(rows, (r) => r.score);
    const up = outcome.mean > 0;
    if (up ? score.lo > 0 : score.hi < 0) return 'required ✓';
    if (up ? score.hi < 0 : score.lo > 0) return 'required ✗ (inverted)';
    return 'required ~ (spans 0)';
}

/** Weights with the evasion term scaled to `e` against the position term, and half its demand at `h` rounds. */
const withParams = (e: number, h: number): HelmsWeights => ({ ...HELMS_WEIGHTS, evasion: e, fireHalf: h });

const EVASION_GRID = [0.5, 1, 2, 4];
const FIRE_HALF_GRID = [3, 8, 15, 30];

/** The evasion weight and fire scale with the best pooled ranking validity over `runs`; ties keep the first. */
function fitParams(runs: readonly Run[]) {
    let best = { e: 1, h: 3, r: -Infinity };
    const table: { e: number; h: number; r: number }[] = [];
    for (const h of FIRE_HALF_GRID) {
        for (const e of EVASION_GRID) {
            const r = validityOf(runs, 'helms', withParams(e, h)).r;
            table.push({ e, h, r });
            if (Number.isFinite(r) && r > best.r + 1e-9) best = { e, h, r };
        }
    }
    return { ...best, table };
}

/** A frame's score under `variant`, `null` when nothing is demanded. */
function frameValue(f: Frame, variant: Variant, w: HelmsWeights) {
    const p = frameParts(f, variant, w);
    return p.den > 1e-9 ? p.num / p.den : null;
}

/** The graded outcome over (t, t+h] of frame `i`, `null` when the run ends first and nobody died. */
function gradedAt(run: Run, i: number, h: number) {
    const f = run.frames;
    const t = f[i].c.t;
    const killed = f.findIndex((x, j) => j > i && !x.alive && x.c.t <= t + h);
    if (killed >= 0) return f[i].hostile - f[killed].hostile - (f[i].c.integrity - f[killed].c.integrity);
    if (run.end < t + h) return run.lost ? -f[i].c.integrity : null;
    const last = f.findLastIndex((x) => x.c.t <= t + h);
    return f[i].hostile - f[last].hostile - (f[i].c.integrity - f[last].c.integrity);
}

const outcomeCache = new WeakMap<Run, (number | null)[]>();
function graded60(run: Run) {
    let g = outcomeCache.get(run);
    if (!g) outcomeCache.set(run, (g = run.frames.map((_, i) => gradedAt(run, i, 60))));
    return g;
}

/** Within-moment points: the score and the 60 s graded outcome of each frame minus their means over the policies at that second. */
function moments(runs: readonly Run[], variant: Variant, w: HelmsWeights): (MomentPoint & { scenario: string })[] {
    const groups = new Map<string, { run: Run; k: number; y: number }[]>();
    for (const run of runs) {
        const g = graded60(run);
        run.frames.forEach((f, i) => {
            const k = frameValue(f, variant, w);
            const y = g[i];
            if (k === null || y === null) return;
            const id = `${key(run)}/${Math.round(f.c.t)}`;
            groups.set(id, [...(groups.get(id) ?? []), { run, k, y }]);
        });
    }
    const out: (MomentPoint & { scenario: string })[] = [];
    for (const g of groups.values()) {
        if (g.length < 3) continue;
        const mk = mean(g.map((x) => x.k));
        const my = mean(g.map((x) => x.y));
        for (const x of g) out.push({ scenario: x.run.scenario, seed: x.run.seed, k: x.k - mk, y: x.y - my });
    }
    return out;
}

const rc = (x: ReturnType<typeof seedCorr>) =>
    Number.isFinite(x.r) ? `${fmt(x.r, 2)} [${fmt(x.lo, 2)}, ${fmt(x.hi, 2)}]` : '–';

/** Isotonic regression (pool adjacent violators) of y on x: block upper edges and block means. */
function isotonic(points: readonly { x: number; y: number }[]) {
    const sorted = [...points].sort((a, b) => a.x - b.x);
    const blocks: { hi: number; sum: number; n: number }[] = [];
    for (const p of sorted) {
        blocks.push({ hi: p.x, sum: p.y, n: 1 });
        while (blocks.length > 1) {
            const [a, b] = [blocks[blocks.length - 2], blocks[blocks.length - 1]];
            if (a.sum / a.n <= b.sum / b.n) break;
            blocks.splice(blocks.length - 2, 2, { hi: b.hi, sum: a.sum + b.sum, n: a.n + b.n });
        }
    }
    const xs = blocks.map((b) => b.hi);
    const ys = blocks.map((b) => Math.min(0.999, Math.max(0.001, b.sum / b.n)));
    return (x: number) => {
        const at = xs.findIndex((hi) => hi >= x);
        return ys[at === -1 ? ys.length - 1 : at];
    };
}

interface CalPoint {
    readonly seed: number;
    readonly p: number;
    readonly y: number;
}

/** Equal-count-bin ECE and Brier skill against the base rate `base`. */
function calibration(points: readonly CalPoint[], base: number) {
    if (points.length < 50) return { n: points.length, ece: NaN, skill: NaN, bins: [] as { p: number; y: number }[] };
    const sorted = [...points].sort((a, b) => a.p - b.p);
    const bins = Array.from({ length: 10 }, (_, b) =>
        sorted.slice(Math.floor((b * sorted.length) / 10), Math.floor(((b + 1) * sorted.length) / 10)),
    ).map((b) => ({ n: b.length, p: mean(b.map((x) => x.p)), y: mean(b.map((x) => x.y)) }));
    const brier = mean(sorted.map((x) => (x.p - x.y) ** 2));
    const brierBase = mean(sorted.map((x) => (base - x.y) ** 2));
    return {
        n: points.length,
        ece: bins.reduce((s, b) => s + (b.n / sorted.length) * Math.abs(b.p - b.y), 0),
        skill: 1 - brier / brierBase,
        bins,
    };
}

/** Calibration with a 95% interval over seeds (resampled seeds). */
function calibrationCi(points: readonly CalPoint[], base: number) {
    const point = calibration(points, base);
    const bySeed = new Map<number, CalPoint[]>();
    for (const p of points) bySeed.set(p.seed, [...(bySeed.get(p.seed) ?? []), p]);
    const groups = [...bySeed.values()];
    const next = rng(20261007);
    const ece: number[] = [];
    const skill: number[] = [];
    for (let b = 0; b < 100 && groups.length > 1; b++) {
        const c = calibration(
            groups.flatMap(() => groups[Math.floor(next() * groups.length)]),
            base,
        );
        if (Number.isFinite(c.ece)) {
            ece.push(c.ece);
            skill.push(c.skill);
        }
    }
    const q = (xs: number[], p: number) => (xs.length > 10 ? xs.sort((a, c) => a - c)[Math.floor(p * xs.length)] : NaN);
    return { ...point, eceLo: q(ece, 0.025), eceHi: q(ece, 0.975), skillLo: q(skill, 0.025), skillHi: q(skill, 0.975) };
}

const WINNING = TIE;

function calPoints(runs: readonly Run[], variant: Variant, w: HelmsWeights): CalPoint[] {
    return runs.flatMap((run) => {
        const g = graded60(run);
        return run.frames.flatMap((f, i) => {
            const p = frameValue(f, variant, w);
            return p === null || g[i] === null ? [] : [{ seed: run.seed, p, y: Number(g[i] > WINNING) }];
        });
    });
}

async function main() {
    const maxSeed = Number(args('max-seed')[0] ?? Infinity);
    const runs = (await loadRuns(args('runs').map((d) => path.resolve(d)))).filter((r) => r.seed <= maxSeed);
    const label = args('label')[0] ?? '';
    const fitMax = Number(args('fit-max-seed')[0] ?? 8);
    const heldScenarios = new Set(args('held-scenario'));
    const scenarios = [...new Set(runs.map((r) => r.scenario))].sort();
    const design = runs.filter((r) => !heldScenarios.has(r.scenario));
    const fitRuns = design.filter((r) => r.seed <= fitMax);
    const testRuns = runs.filter((r) => r.seed > fitMax);
    const lines: string[] = [];
    const out = (s = '') => lines.push(s);

    const given = args('evasion-weight')[0];
    const fitted = given ? undefined : fitParams(fitRuns);
    const w = given
        ? withParams(Number(given), Number(args('fire-half')[0] ?? HELMS_WEIGHTS.fireHalf))
        : withParams(fitted!.e, fitted!.h);
    out(`## Helms score validation${label ? `: ${label}` : ''}`);
    out();
    out(
        `runs ${runs.length}; scenarios ${scenarios.join(', ')}${heldScenarios.size ? ` (never fitted: ${[...heldScenarios].join(', ')})` : ''}; fit seeds ≤ ${fitMax}; held-out seeds ${[...new Set(testRuns.map((r) => r.seed))].sort((a, c) => a - c).join(',')}`,
    );
    out();
    if (fitted) {
        out(
            `Evasion weight (position 1, the other terms 1) and fire scale (rounds at half the evasion demand) fitted on fit seeds of the non-held scenarios, by pooled policy-ranking validity, as weight/scale: ${fitted.table.map((t) => `${t.e}/${t.h}: ${fmt(t.r, 3)}`).join('; ')}. Chosen **${fitted.e} / ${fitted.h}**.`,
        );
    } else {
        out(`Evasion weight ${given}, fire scale ${args('fire-half')[0] ?? HELMS_WEIGHTS.fireHalf} given.`);
    }
    out();

    // run-level scores by policy
    out('### Mean run score by policy');
    out();
    out('Time-mean over each run, demand-weighted for the rule score. All seeds.');
    out();
    for (const variant of ['helms', 'helms10-v3'] as const) {
        out(`${variant}:`);
        out();
        out(`| scenario | ${POLICIES.join(' | ')} |`);
        out(`| --- |${POLICIES.map(() => ' --- |').join('')}`);
        for (const s of scenarios) {
            const cell = (p: PolicyName) =>
                fmt(
                    mean(
                        runs
                            .filter((r) => r.scenario === s && r.policy === p)
                            .map((r) => runScore(r, variant, w))
                            .filter(Number.isFinite),
                    ),
                    2,
                );
            out(`| ${s}${heldScenarios.has(s) ? ' (held out)' : ''} | ${POLICIES.map(cell).join(' | ')} |`);
        }
        out();
    }
    out('Game outcome by policy (mean graded outcome / own integrity lost / kills of the seeds):');
    out();
    out(`| scenario | ${POLICIES.join(' | ')} |`);
    out(`| --- |${POLICIES.map(() => ' --- |').join('')}`);
    for (const s of scenarios) {
        const cell = (p: PolicyName) => {
            const rs = runs.filter((r) => r.scenario === s && r.policy === p && r.frames.length);
            const os = rs.map((r) => outcomeOver(r, Infinity));
            return `${fmt(mean(os.map((o) => o.graded)), 2)} / ${fmt(mean(os.map((o) => o.lost)), 2)} / ${rs.filter((r) => r.killed).length}/${rs.length}`;
        };
        out(`| ${s}${heldScenarios.has(s) ? ' (held out)' : ''} | ${POLICIES.map(cell).join(' | ')} |`);
    }
    out();

    // ranking validity
    out('### Policy-ranking validity');
    out();
    out(
        `Every pair of the ${POLICIES.length} policies on one scenario and seed over the pair's common time: the score gap against the graded-outcome gap (pairs under ${TIE} dropped). Spearman r [95% CI over seeds] / share of pairs ordered the same way.`,
    );
    out();
    const sets: [string, readonly Run[]][] = [
        ['fit seeds (non-held scenarios)', fitRuns],
        ['held-out seeds', testRuns],
        ['all seeds', runs],
    ];
    const shown: Variant[] = [...VARIANTS];
    out(`| set | scenario | ${shown.join(' | ')} |`);
    out(`| --- | --- |${shown.map(() => ' --- |').join('')}`);
    for (const [name, set] of sets) {
        const rows = [...new Set(set.map((r) => r.scenario))].sort();
        for (const sc of [...rows, 'all']) {
            out(
                `| ${name} | ${sc}${heldScenarios.has(sc) ? ' (held out)' : ''} | ${shown.map((v) => rv(validityOf(set, v, w, sc === 'all' ? undefined : sc))).join(' | ')} |`,
            );
        }
    }
    out();

    // contrasts
    out('### Policy contrasts');
    out();
    out(
        'Paired over seeds, positive is better for the first policy on every column. score Δ is the rule score (helms) and v3 helms10; graded Δ the game. Required where the graded outcome separates the pair: the score must order it the same way.',
    );
    out();
    out(
        '| set | scenario | contrast | score Δ | helms10-v3 Δ | graded Δ | integrity lost Δ | survival Δ (s) | kill Δ | verdict (score) | verdict (helms10-v3) |',
    );
    out('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const [name, set] of [
        ['held-out seeds', testRuns],
        ['all seeds', runs],
    ] as const) {
        for (const sc of [...scenarios, 'all']) {
            const sub = set.filter((r) => sc === 'all' || r.scenario === sc);
            for (const [a, b] of CONTRASTS) {
                const rows = pairedRows(sub, a, b, 'helms', w);
                const rows3 = pairedRows(sub, a, b, 'helms10-v3', w);
                if (!rows.length) continue;
                out(
                    `| ${name} | ${sc} | ${a} − ${b} | ${ci(col(rows, (r) => r.score))} | ${ci(col(rows3, (r) => r.score))} | ${ci(col(rows, (r) => r.graded))} | ${ci(col(rows, (r) => r.lost))} | ${ci(col(rows, (r) => r.survival))} | ${ci(col(rows, (r) => r.kill))} | ${verdict(rows)} | ${verdict(rows3.map((r, i) => ({ ...rows[i], score: r.score })))} |`,
                );
            }
        }
    }
    out();

    // falsification
    out('### Falsification: close-in against reference');
    out();
    out(
        'The test: where close-in loses to the reference on survival and on the graded outcome, a score that ranks close-in above the reference repeats the position-only trap. Rows where the condition holds are marked; there the score must not rank close-in above the reference (reference − close-in CI must not lie below 0).',
    );
    out();
    out(
        '| set | scenario | close-in loses on survival | close-in loses on outcome | score | reference − close-in | verdict |',
    );
    out('| --- | --- | --- | --- | --- | --- | --- |');
    for (const [name, set] of [
        ['held-out seeds', testRuns],
        ['all seeds', runs],
    ] as const) {
        for (const sc of [...scenarios, 'all']) {
            const sub = set.filter((r) => sc === 'all' || r.scenario === sc);
            const base = pairedRows(sub, 'reference', 'close-in', 'helms', w);
            if (!base.length) continue;
            const surv = col(base, (r) => r.survival);
            const outc = col(base, (r) => r.graded);
            const lostOn = (b: ReturnType<typeof col>) =>
                b.lo > 0 ? 'yes' : b.hi < 0 ? 'no (reference loses)' : 'not shown';
            const applies = surv.lo > 0 && outc.lo > 0;
            for (const variant of [
                'helms',
                'position-only',
                'evasion-only',
                'helms10-v3',
                'tactical-opportunity',
            ] as const) {
                const d = col(pairedRows(sub, 'reference', 'close-in', variant, w), (r) => r.score);
                const result =
                    d.lo >= 0
                        ? 'close-in not above reference'
                        : d.hi < 0
                          ? 'FAIL: close-in outranks reference'
                          : 'no separation';
                out(
                    `| ${name} | ${sc} | ${ci(surv)} ${lostOn(surv)} | ${ci(outc)} ${lostOn(outc)} | ${variant} | ${ci(d)} | ${applies ? '**condition holds**: ' : 'condition not met: '}${result} |`,
                );
            }
        }
    }
    out();

    // leave one scenario out
    if (!given) {
        out('### Leave one scenario out');
        out();
        out(
            'The evasion weight is refit on the fit seeds of the other non-held scenarios, then the held scenario is scored on its held-out seeds: neither the scenario nor the seed was seen.',
        );
        out();
        out(
            '| held out | refit evasion weight / fire scale | ranking validity (held-out seeds, refit) | with the all-scenario weight |',
        );
        out('| --- | --- | --- | --- |');
        for (const s of scenarios.filter((x) => !heldScenarios.has(x))) {
            const f = fitParams(fitRuns.filter((r) => r.scenario !== s));
            const held = testRuns.filter((r) => r.scenario === s);
            out(
                `| ${s} | ${f.e} / ${f.h} | ${rv(validityOf(held, 'helms', withParams(f.e, f.h)))} | ${rv(validityOf(held, 'helms', w))} |`,
            );
        }
        out();
    }

    // calibration
    out('### Calibration');
    out();
    out(
        `Frame score against the next 60 s: y = 1 when the graded outcome over the next 60 s exceeds ${WINNING}. An isotonic map from score to P(y) is fitted on the fit seeds of the non-held scenarios and checked on held-out seeds and held scenarios. ECE over 10 equal-count bins, Brier skill against the fit base rate, 95% CI over seeds.`,
    );
    out();
    out('| variant | set | scenario | n | ECE [CI] | Brier skill [CI] |');
    out('| --- | --- | --- | --- | --- | --- |');
    for (const variant of ['helms', 'helms10-v3'] as const) {
        const fitPoints = calPoints(fitRuns, variant, w);
        const base = mean(fitPoints.map((p) => p.y));
        const map = isotonic(fitPoints.map((p) => ({ x: p.p, y: p.y })));
        const sub = (set: readonly Run[], sc?: string) =>
            calPoints(
                set.filter((r) => !sc || r.scenario === sc),
                variant,
                w,
            ).map((p) => ({ ...p, p: map(p.p) }));
        const rowsOf: [string, readonly Run[], string?][] = [
            ['held-out seeds', testRuns.filter((r) => !heldScenarios.has(r.scenario))],
            ...scenarios
                .filter((s) => !heldScenarios.has(s))
                .map((s) => ['held-out seeds', testRuns, s] as [string, readonly Run[], string]),
            ...[...heldScenarios].map((s) => ['held-out scenario', runs, s] as [string, readonly Run[], string]),
        ];
        for (const [name, set, sc] of rowsOf) {
            const c = calibrationCi(sub(set, sc), base);
            out(
                `| ${variant} | ${name} | ${sc ?? 'all'} | ${c.n} | ${fmt(c.ece)} [${fmt(c.eceLo)}, ${fmt(c.eceHi)}] | ${fmt(c.skill)} [${fmt(c.skillLo)}, ${fmt(c.skillHi)}] |`,
            );
        }
    }
    out();
    const demo = calibration(
        calPoints(fitRuns, 'helms', w).map((p) => ({ ...p, p: p.p })),
        0.5,
    );
    out(
        `Reliability of the raw rule score on the fit seeds (bin mean score → observed y): ${demo.bins.map((b) => `${fmt(b.p, 2)}→${fmt(b.y, 2)}`).join(' ')}`,
    );
    out();

    // predictive validity
    out('### Predictive validity');
    out();
    out(
        'Within-moment: the frame score and the 60 s graded outcome of each frame minus their means over the policies of the same scenario and seed at the same second (at least three policies). Every policy faces the same opponent, so what is left is what the helm did; the stretch of the fight is removed. Pearson r [95% CI over seeds].',
    );
    out();
    const variantsShown: Variant[] = ['helms', 'position-only', 'evasion-only', 'helms10-v3', 'tactical-opportunity'];
    out(`| set | scenario | ${variantsShown.join(' | ')} |`);
    out(`| --- | --- |${variantsShown.map(() => ' --- |').join('')}`);
    for (const [name, set] of [
        ['fit seeds', fitRuns],
        ['held-out seeds', testRuns],
    ] as const) {
        const ms = variantsShown.map((v) => moments(set, v, w));
        for (const sc of [...new Set(set.map((r) => r.scenario))].sort().concat('all')) {
            out(
                `| ${name} | ${sc} | ${ms.map((m) => rc(seedCorr(m.filter((p) => sc === 'all' || p.scenario === sc)))).join(' | ')} |`,
            );
        }
    }
    out();
    const heldOnly = runs.filter((r) => heldScenarios.has(r.scenario));
    if (heldOnly.length) {
        out('Held-out scenario(s), all seeds:');
        out();
        out(`| scenario | ${variantsShown.join(' | ')} |`);
        out(`| --- |${variantsShown.map(() => ' --- |').join('')}`);
        const ms = variantsShown.map((v) => moments(heldOnly, v, w));
        for (const sc of heldScenarios)
            out(`| ${sc} | ${ms.map((m) => rc(seedCorr(m.filter((p) => p.scenario === sc)))).join(' | ')} |`);
        out();
    }

    // term diagnostics
    out('### Terms');
    out();
    out('Share of frames with demand, and mean score where demanded, per scenario (all runs).');
    out();
    out(`| scenario | ${TERMS.map((t) => `${t} demand / score`).join(' | ')} |`);
    out(`| --- |${TERMS.map(() => ' --- |').join('')}`);
    for (const s of scenarios) {
        const fs2 = runs.filter((r) => r.scenario === s).flatMap((r) => r.frames);
        const cell = (t: (typeof TERMS)[number]) => {
            const d = fs2.filter((f) => f.c.terms[t].d > 0);
            return `${fmt(d.length / Math.max(1, fs2.length), 2)} / ${fmt(mean(d.map((f) => f.c.terms[t].s)), 2)}`;
        };
        out(`| ${s} | ${TERMS.map(cell).join(' | ')} |`);
    }
    out();
    out('Per policy (demand share / mean score where demanded; position, evasion):');
    out();
    out(`| scenario | ${POLICIES.join(' | ')} |`);
    out(`| --- |${POLICIES.map(() => ' --- |').join('')}`);
    for (const s of scenarios) {
        const cell = (p: PolicyName) => {
            const fr = runs.filter((r) => r.scenario === s && r.policy === p).flatMap((r) => r.frames);
            const one = (t: 'position' | 'evasion') => {
                const d = fr.filter((f) => f.c.terms[t].d > 0);
                return `${fmt(d.length / Math.max(1, fr.length), 2)}/${fmt(mean(d.map((f) => f.c.terms[t].s)), 2)}`;
            };
            return `${one('position')}; ${one('evasion')}`;
        };
        out(`| ${s} | ${POLICIES.map(cell).join(' | ')} |`);
    }
    out();
    const report = lines.join('\n') + '\n';
    const target = args('out')[0];
    if (target) fs.writeFileSync(target, report);
    process.stdout.write(report);
}

void main();
