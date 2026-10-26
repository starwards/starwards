import { WaveFitness } from './wave-fitness';
import { WaveRun } from '../training/wave-compare';
import { mulberry32 } from '@starwards/core/internal';

/**
 * The search's selection metric: one paired number per candidate against a baseline, built from
 * components on different scenarios (W-waves hold median and p10, the intercept and lof cuts), each
 * divided by its per-seed noise and weighted by how far it separates a playing crew from an idle one.
 * A component the crew cannot move beyond noise gets little weight, so the composite is not driven
 * by the noisiest number. W-waves pass is not a component: it is a non-inferiority guard
 * (`passNonInferiority`).
 */
export type CompositeComponent = {
    name: string;
    scenario: string;
    metric: keyof WaveFitness;
    stat: 'mean' | 'median' | 'p10';
    higherIsBetter: boolean;
};

export type ComponentWeight = CompositeComponent & {
    /** Per-seed noise of the component's paired difference: bootstrap SD × √seeds (the SD of the differences, for a mean). */
    sigma: number;
    /** Oriented (crew − idle) difference over `sigma`. */
    snr: number;
    /** max(snr, 0) normalised over the components; the composite sums weight × difference / sigma. */
    weight: number;
    seeds: number;
};

export type CompositeWeights = { crew: string; idle: string; components: ComponentWeight[] };

export type Estimate = { estimate: number; ci: [low: number, high: number]; sd: number };

/** Seeds per scenario, a crew's runs keyed by seed. */
export type ScenarioRuns = Readonly<Record<string, readonly WaveRun[]>>;

/** The selection metric's components (revision 2026-10-22 of the waves plan). */
export const COMPOSITE_COMPONENTS: readonly CompositeComponent[] = [
    { name: 'waves-hold-median', scenario: 'W-waves', metric: 'holdSeconds', stat: 'median', higherIsBetter: true },
    { name: 'waves-hold-p10', scenario: 'W-waves', metric: 'holdSeconds', stat: 'p10', higherIsBetter: true },
    {
        name: 'intercept-capsule',
        scenario: 'W-cut-intercept',
        metric: 'stationCapsuleLost',
        stat: 'mean',
        higherIsBetter: false,
    },
    { name: 'lof-capsule', scenario: 'W-cut-lof', metric: 'stationCapsuleLost', stat: 'mean', higherIsBetter: false },
];

/** Linear-interpolation quantile (R type 7). */
export function quantile(xs: readonly number[], q: number) {
    const s = [...xs].sort((a, b) => a - b);
    const h = (s.length - 1) * q;
    const lo = Math.floor(h);
    return s[lo] + (h - lo) * ((s[Math.min(lo + 1, s.length - 1)] ?? s[lo]) - s[lo]);
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function statistic(stat: CompositeComponent['stat'], xs: readonly number[]) {
    return stat === 'mean' ? mean(xs) : quantile(xs, stat === 'median' ? 0.5 : 0.1);
}

/**
 * Percentile bootstrap of `f(baseline, candidate)` resampling seed indices jointly (each draw keeps
 * a seed's pair together), with a fixed rng seed so a report reprints the same interval.
 */
export function pairedBootstrap(
    baseline: readonly number[],
    candidate: readonly number[],
    f: (b: readonly number[], c: readonly number[]) => number,
    resamples = 4000,
    seed = 1,
): Estimate {
    const rng = mulberry32(seed);
    const n = baseline.length;
    const values = new Float64Array(resamples);
    const b = new Array<number>(n);
    const c = new Array<number>(n);
    for (let r = 0; r < resamples; r++) {
        for (let i = 0; i < n; i++) {
            const j = Math.floor(rng() * n);
            b[i] = baseline[j];
            c[i] = candidate[j];
        }
        values[r] = f(b, c);
    }
    values.sort();
    const m = values.reduce((a, v) => a + v, 0) / resamples;
    const sd = Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / (resamples - 1));
    return {
        estimate: f(baseline, candidate),
        ci: [values[Math.floor(0.025 * (resamples - 1))], values[Math.ceil(0.975 * (resamples - 1))]],
        sd: Number.isFinite(sd) && sd > 1e-12 ? sd : 0,
    };
}

/** The two crews' runs of the component's scenario on the seeds both played, as metric values. */
function paired(runs: ScenarioRuns, c: CompositeComponent, baseline: string, candidate: string) {
    const rows = runs[c.scenario];
    if (!rows) throw new Error(`no ${c.scenario} results for component ${c.name}`);
    const bySeed = (crew: string) => new Map(rows.filter((r) => r.crew === crew).map((r) => [r.seed, r]));
    const b = bySeed(baseline);
    const k = bySeed(candidate);
    const seeds = [...k.keys()].filter((s) => b.has(s)).sort((x, y) => x - y);
    if (seeds.length < 2) throw new Error(`${c.scenario}: ${baseline} and ${candidate} share ${seeds.length} seed(s)`);
    return {
        b: seeds.map((s) => b.get(s)!.fitness[c.metric]),
        k: seeds.map((s) => k.get(s)!.fitness[c.metric]),
    };
}

/** Oriented component difference (positive = candidate better) with its paired bootstrap. */
function componentDelta(runs: ScenarioRuns, c: CompositeComponent, baseline: string, candidate: string) {
    const { b, k } = paired(runs, c, baseline, candidate);
    const sign = c.higherIsBetter ? 1 : -1;
    const f = (bs: readonly number[], ks: readonly number[]) => sign * (statistic(c.stat, ks) - statistic(c.stat, bs));
    return { seeds: b.length, ...pairedBootstrap(b, k, f) };
}

/**
 * Weights from a calibration pair, `crew` against `idle` on the same seeds: a component's weight is
 * its signal-to-noise, (crew − idle) over the per-seed noise of that difference, normalised to sum 1;
 * one where idle does as well or better weighs 0.
 */
export function calibrateWeights(
    components: readonly CompositeComponent[],
    runs: ScenarioRuns,
    crew: string,
    idle: string,
): CompositeWeights {
    const raw = components.map((c) => {
        const d = componentDelta(runs, c, idle, crew);
        const sigma = d.sd * Math.sqrt(d.seeds);
        const snr = sigma > 0 ? d.estimate / sigma : d.estimate > 0 ? Infinity : 0;
        return { ...c, sigma, snr, seeds: d.seeds };
    });
    const total = raw.reduce((a, c) => a + Math.max(0, c.snr), 0);
    return {
        crew,
        idle,
        components: raw.map((c) => ({ ...c, weight: total > 0 ? Math.max(0, c.snr) / total : 0 })),
    };
}

/**
 * `candidate` against `baseline` on every weighted component, and the composite: Σ weight ×
 * difference / sigma, in per-seed noise units, with a paired bootstrap interval (each scenario's
 * seeds resampled jointly across that scenario's components).
 */
export function compositeCompare(weights: CompositeWeights, runs: ScenarioRuns, baseline: string, candidate: string) {
    const used = weights.components.filter((c) => c.weight > 0);
    const components = used.map((c) => ({ name: c.name, ...componentDelta(runs, c, baseline, candidate) }));
    const resamples = 4000;
    const totals = new Float64Array(resamples);
    for (const scenario of new Set(used.map((c) => c.scenario))) {
        const mine = used.filter((c) => c.scenario === scenario);
        const columns = mine.map((c) => paired(runs, c, baseline, candidate));
        const n = columns[0].b.length;
        const rng = mulberry32(1);
        for (let r = 0; r < resamples; r++) {
            const idx = Array.from({ length: n }, () => Math.floor(rng() * n));
            mine.forEach((c, j) => {
                const sign = c.higherIsBetter ? 1 : -1;
                const b = idx.map((i) => columns[j].b[i]);
                const k = idx.map((i) => columns[j].k[i]);
                totals[r] += (c.weight * sign * (statistic(c.stat, k) - statistic(c.stat, b))) / c.sigma;
            });
        }
    }
    totals.sort();
    const estimate = used.reduce((a, c, i) => a + (c.weight * components[i].estimate) / c.sigma, 0);
    return {
        components,
        composite: {
            estimate,
            ci: [totals[Math.floor(0.025 * (resamples - 1))], totals[Math.ceil(0.975 * (resamples - 1))]] as [
                number,
                number,
            ],
        },
    };
}

/** W-waves pass: every station alive through `passWaves` waves. */
function passed(r: WaveRun, passWaves: number) {
    if (r.stationsLost === undefined || r.survived === undefined) {
        throw new Error(
            `${r.crew} seed ${r.seed}: row has no stationsLost/survived (run it on a waves CLI that records them)`,
        );
    }
    return r.stationsLost === 0 && r.survived >= passWaves;
}

/**
 * Pass non-inferiority on the seeds both crews played: the candidate may fail at most 2 per 64 seeds
 * that the baseline passed (rounded down for other seed counts).
 */
export function passNonInferiority(runs: readonly WaveRun[], baseline: string, candidate: string, passWaves: number) {
    const bySeed = (crew: string) => new Map(runs.filter((r) => r.crew === crew).map((r) => [r.seed, r]));
    const b = bySeed(baseline);
    const k = bySeed(candidate);
    const seeds = [...k.keys()].filter((s) => b.has(s));
    let worse = 0;
    let better = 0;
    let basePasses = 0;
    let candPasses = 0;
    for (const s of seeds) {
        const bp = passed(b.get(s)!, passWaves);
        const kp = passed(k.get(s)!, passWaves);
        basePasses += +bp;
        candPasses += +kp;
        if (bp && !kp) worse++;
        if (!bp && kp) better++;
    }
    const maxWorse = Math.floor((2 * seeds.length) / 64);
    return { seeds: seeds.length, basePasses, candPasses, worse, better, maxWorse, nonInferior: worse <= maxWorse };
}
