/**
 * Matched-seed validation of the weapons station score and the tactical score. Reads the runs of
 * `score:weapons-runs` (`<root>/<scenario>/weapons-<crew>/<scenario>_seed<N>.sgr`) and prints a
 * markdown report: per-crew means, paired orderings with bootstrap intervals over seeds (all seeds
 * and held-out seeds), the fit of ρ and its leave-one-scenario-out refit, and the Spearman of window
 * T with a kill in the next 60 s against a persistence baseline.
 *
 *   npm --prefix modules/ai run score:weapons -- --runs <root> [--out report.md]
 *
 * Each run's frames, reduced to {@link TacticalFrame}s, and its shot and damage events are cached
 * beside the recording as `<run>.wkpi2.json`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
    TACTICAL_WEIGHTS,
    TacticalFrame,
    TacticalWeights,
    TacticalWindow,
    WeaponsRates,
    observeTactical,
    tacticalWindows,
    weaponsScore,
} from './weapons-kpi';
import { readEvents, readFrames } from './recording';

import { RecordingEventLine } from '@starwards/core/internal';
import { WEAPONS_CREWS } from './weapons-runs';

const PLAYER = 'GVTS';
type Crew = (typeof WEAPONS_CREWS)[number];

interface Run {
    readonly scenario: string;
    readonly seed: number;
    readonly crew: Crew;
    readonly frames: TacticalFrame[];
    readonly events: RecordingEventLine[];
    readonly killed: boolean;
}

function args(name: string) {
    return process.argv.flatMap((a, i) => (a === `--${name}` ? [process.argv[i + 1]] : []));
}

async function loadRun(sgr: string) {
    const cache = sgr.replace(/\.sgr$/, '.wkpi2.json');
    if (fs.existsSync(cache))
        return JSON.parse(fs.readFileSync(cache, 'utf8')) as { frames: TacticalFrame[]; events: RecordingEventLine[] };
    const frames = (await readFrames(sgr)).flatMap((f) => observeTactical(f.t, f.saved, PLAYER) ?? []);
    const events = readEvents(sgr).filter((e) => e.kind === 'shot' || e.kind === 'damage');
    fs.writeFileSync(cache, JSON.stringify({ frames, events }));
    return { frames, events };
}

async function loadRuns(roots: readonly string[]) {
    const runs: Run[] = [];
    for (const root of roots) {
        for (const scenario of fs.readdirSync(root)) {
            const dir = path.join(root, scenario);
            if (!fs.statSync(dir).isDirectory()) continue;
            for (const crewDir of fs.readdirSync(dir)) {
                const crew = crewDir.replace(/^weapons-/, '') as Crew;
                if (!WEAPONS_CREWS.includes(crew)) continue;
                for (const file of fs.readdirSync(path.join(dir, crewDir)).filter((f) => f.endsWith('.sgr'))) {
                    const [, sc, seed] = /^(.+)_seed(\d+)\.sgr$/.exec(file) ?? [];
                    if (!sc) continue;
                    const result = path.join(dir, crewDir, file.replace(/\.sgr$/, '.result.json'));
                    if (!fs.existsSync(result)) continue;
                    const { killed } = JSON.parse(fs.readFileSync(result, 'utf8')) as { killed: boolean };
                    runs.push({
                        scenario: sc,
                        seed: Number(seed),
                        crew,
                        killed,
                        ...(await loadRun(path.join(dir, crewDir, file))),
                    });
                    process.stderr.write('.');
                }
            }
        }
    }
    process.stderr.write('\n');
    return runs;
}

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

/** Deterministic generator, so the report's intervals reproduce. */
function rng(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function bootstrap(deltas: readonly number[], resamples = 2000) {
    if (!deltas.length) return { mean: NaN, lo: NaN, hi: NaN, n: 0 };
    const next = rng(20261003);
    const means: number[] = [];
    for (let b = 0; b < resamples; b++) {
        let s = 0;
        for (let i = 0; i < deltas.length; i++) s += deltas[Math.floor(next() * deltas.length)];
        means.push(s / deltas.length);
    }
    means.sort((a, c) => a - c);
    return {
        mean: mean(deltas),
        lo: means[Math.floor(0.025 * resamples)],
        hi: means[Math.floor(0.975 * resamples)],
        n: deltas.length,
    };
}

interface Scored extends Run {
    readonly windows: TacticalWindow[];
    readonly rates: WeaponsRates;
    readonly T: number | null;
    readonly O: number;
    readonly V: number | null;
    /** T over the windows that start with the gun outranged / in range. */
    readonly Tout: number | null;
    readonly Tin: number | null;
}

const meanOrNull = (xs: readonly number[]) => (xs.length ? mean(xs) : null);

function score(runs: readonly Run[], w: TacticalWeights): Scored[] {
    return runs.map((run) => {
        const windows = tacticalWindows(run.frames, run.events, PLAYER, w);
        const ts = windows.filter((x) => x.T !== null);
        const T = meanOrNull(ts.map((x) => x.T!));
        const O = windows.length ? mean(windows.map((x) => x.O)) : 0;
        return {
            ...run,
            windows,
            rates: weaponsScore(run.frames, run.events, PLAYER),
            T,
            O,
            V: T !== null && O > 0 ? T / O : null,
            Tout: meanOrNull(ts.filter((x) => x.outranged).map((x) => x.T!)),
            Tin: meanOrNull(ts.filter((x) => !x.outranged).map((x) => x.T!)),
        };
    });
}

/** ρ: the 95th percentile of windowed incapacitation rate per unit gun on the given runs. */
function fitRho(runs: readonly Run[]): number {
    const rates = runs
        .flatMap((r) => tacticalWindows(r.frames, r.events, PLAYER, { ...TACTICAL_WEIGHTS, rho: 1 }))
        .filter((x) => x.gun > 0.25)
        .map((x) => x.dI / (x.gun * TACTICAL_WEIGHTS.windowSeconds))
        .sort((a, c) => a - c);
    return rates.length ? Math.max(1e-4, rates[Math.floor(0.95 * (rates.length - 1))]) : TACTICAL_WEIGHTS.rho;
}

type Metric = (r: Scored) => number | null;
const METRICS: Record<string, Metric> = {
    T: (r) => r.T,
    O: (r) => r.O,
    V: (r) => r.V,
    Kw: (r) => r.rates.kw,
    lock: (r) => r.rates.lockUptime,
    lockThreat: (r) => r.rates.lockThreat,
    /** Share of fighting frames locked on the scenario's designated target (`target`). */
    lockDesignated: (r) => {
        const fighting = r.frames.filter((f) => f.enemies.some((e) => !e.destroyed));
        return fighting.length
            ? fighting.filter((f) => f.weapons.targetId === 'target').length / fighting.length
            : null;
    },
    friendly: (r) => r.rates.friendly,
    clipped: (r) => (r.windows.length ? mean(r.windows.map((x) => Number(x.clipped))) : null),
    nosol: (r) => r.rates.nosol,
    dominated: (r) => r.rates.dominated,
    T_outranged: (r) => r.Tout,
    T_inrange: (r) => r.Tin,
};

function paired(runs: readonly Scored[], a: Crew, b: Crew, metric: Metric) {
    const by = new Map(runs.map((r) => [`${r.scenario}/${r.seed}/${r.crew}`, r]));
    return runs.flatMap((x) => {
        if (x.crew !== a) return [];
        const y = by.get(`${x.scenario}/${x.seed}/${b}`);
        const mx = metric(x);
        const my = y && metric(y);
        return mx !== null && my !== null && my !== undefined && Number.isFinite(mx - my) ? [mx - my] : [];
    });
}

/** The orderings the scores must reproduce: a − b on the metric, expected above 0. */
const ORDERINGS: [Crew, Crew, string][] = [
    ['reference', 'idle', 'T'],
    ['reference', 'idle', 'V'],
    ['reference', 'spray-fire', 'Kw'],
    ['reference', 'wrong-ammo', 'Kw'],
    ['reference', 'wrong-ammo', 'V'],
    ['reference', 'no-lock', 'lock'],
    ['torpedo-reference', 'reference', 'T_outranged'],
    ['torpedo-reference', 'reference', 'T'],
    ['torpedo-reference', 'reference', 'T_inrange'],
];

function rank(xs: readonly number[]) {
    const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(xs.length);
    for (let i = 0; i < idx.length;) {
        let j = i;
        while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
        for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2;
        i = j + 1;
    }
    return r;
}

function spearman(pairs: readonly (readonly [number, number])[]) {
    if (pairs.length < 3) return NaN;
    const rx = rank(pairs.map((p) => p[0]));
    const ry = rank(pairs.map((p) => p[1]));
    const mx = mean(rx);
    const my = mean(ry);
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < rx.length; i++) {
        sxy += (rx[i] - mx) * (ry[i] - my);
        sxx += (rx[i] - mx) ** 2;
        syy += (ry[i] - my) ** 2;
    }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}

const fmt = (x: number | null | undefined, d = 3) =>
    x !== null && x !== undefined && Number.isFinite(x) ? x.toFixed(d) : '–';
const ci = (b: ReturnType<typeof bootstrap>) =>
    b.n ? `${fmt(b.mean)} [${fmt(b.lo)}, ${fmt(b.hi)}] n=${b.n}${b.lo > 0 ? ' ✓' : b.hi < 0 ? ' ✗' : ''}` : '–';

async function main() {
    const runs = await loadRuns(args('runs').map((d) => path.resolve(d)));
    const scenarios = [...new Set(runs.map((r) => r.scenario))].sort();
    const seeds = [...new Set(runs.map((r) => r.seed))].sort((a, c) => a - c);
    const fitSeeds = new Set(seeds.slice(0, Math.ceil((2 * seeds.length) / 3)));
    const lines: string[] = [];
    const out = (s = '') => lines.push(s);

    const rho = fitRho(runs.filter((r) => r.crew === 'reference' && fitSeeds.has(r.seed)));
    const w = { ...TACTICAL_WEIGHTS, rho };
    const all = score(runs, w);
    out(
        `runs ${runs.length}; scenarios ${scenarios.join(', ')}; fit seeds ${[...fitSeeds].join(',')}; held-out ${seeds.filter((s) => !fitSeeds.has(s)).join(',')}`,
    );
    out();
    out(
        `weights: \`${JSON.stringify(w)}\` (ρ fitted on reference runs of the fit seeds: 95th percentile of windowed incapacitation rate per unit gun)`,
    );
    out();
    out('### Per-crew means');
    out();
    out(`| scenario | crew | kills | ${Object.keys(METRICS).join(' | ')} | rounds |`);
    out(
        `| --- | --- | --- |${Object.keys(METRICS)
            .map(() => ' --- |')
            .join('')} --- |`,
    );
    for (const s of scenarios) {
        for (const crew of WEAPONS_CREWS) {
            const sub = all.filter((r) => r.scenario === s && r.crew === crew);
            if (!sub.length) continue;
            const m = (f: Metric) => fmt(mean(sub.flatMap((r) => f(r) ?? []).filter(Number.isFinite)));
            out(
                `| ${s} | ${crew} | ${sub.filter((r) => r.killed).length}/${sub.length} | ${Object.values(METRICS).map(m).join(' | ')} | ${fmt(mean(sub.map((r) => r.rates.rounds)), 0)} |`,
            );
        }
    }
    out();
    const table = (title: string, subset: readonly Scored[]) => {
        out(`### ${title}`);
        out();
        out('Paired Δ (a − b) per seed, 95% bootstrap CI over seeds. ✓ above 0, ✗ below.');
        out();
        out(`| scenario | ${ORDERINGS.map(([a, b, m]) => `${a} − ${b} (${m})`).join(' | ')} |`);
        out(`| --- |${ORDERINGS.map(() => ' --- |').join('')}`);
        for (const s of [...scenarios, 'all']) {
            const sub = subset.filter((r) => s === 'all' || r.scenario === s);
            out(`| ${s} | ${ORDERINGS.map(([a, b, m]) => ci(bootstrap(paired(sub, a, b, METRICS[m])))).join(' | ')} |`);
        }
        out();
    };
    table('All seeds', all);
    table(
        'Held-out seeds',
        all.filter((r) => !fitSeeds.has(r.seed)),
    );

    out('### Leave one scenario out (ρ refit on the other scenarios)');
    out();
    out('| held out | ρ | reference − idle (T) | reference − idle (V) | reference − wrong-ammo (V) |');
    out('| --- | --- | --- | --- | --- |');
    for (const s of scenarios) {
        const r = fitRho(runs.filter((x) => x.crew === 'reference' && x.scenario !== s));
        const held = score(
            runs.filter((x) => x.scenario === s),
            { ...TACTICAL_WEIGHTS, rho: r },
        );
        out(
            `| ${s} | ${fmt(r, 4)} | ${ci(bootstrap(paired(held, 'reference', 'idle', METRICS.T)))} | ${ci(bootstrap(paired(held, 'reference', 'idle', METRICS.V)))} | ${ci(bootstrap(paired(held, 'reference', 'wrong-ammo', METRICS.V)))} |`,
        );
    }
    out();
    out('### Predictive validity');
    out();
    out(
        'Spearman over windows (all crews) of window T with a kill in the next 60 s, against the persistence baseline: the incapacitation the enemy took in the previous window.',
    );
    out();
    out('| scenario | windows | ρ_s(T, kill60) | ρ_s(persistence, kill60) | ρ_s(O, kill60) |');
    out('| --- | --- | --- | --- | --- |');
    for (const s of [...scenarios, 'all']) {
        const ws = all
            .filter((r) => s === 'all' || r.scenario === s)
            .flatMap((r) => r.windows.map((x, i) => ({ ...x, prev: i > 0 ? r.windows[i - 1].dI : 0 })));
        const withT = ws.filter((x) => x.T !== null);
        out(
            `| ${s} | ${withT.length} | ${fmt(spearman(withT.map((x) => [x.T!, Number(x.kill60)])))} | ${fmt(spearman(withT.map((x) => [x.prev, Number(x.kill60)])))} | ${fmt(spearman(withT.map((x) => [x.O, Number(x.kill60)])))} |`,
        );
    }
    const report = lines.join('\n') + '\n';
    const target = args('out')[0];
    if (target) fs.writeFileSync(target, report);
    process.stdout.write(report);
}

void main();
