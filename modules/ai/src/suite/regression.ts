import { Level, RegressionRule } from './ladder';
import { pairedComparison, pairedText } from '../training/paired';

/** One rung of a level, summarised over its seeds. */
export type RungResult = {
    kind: 'rung';
    name: string;
    runs: number;
    kills: number;
    /** Median sim-seconds to kill over the killed runs; null without kills. */
    medianSeconds: number | null;
    refused: number;
    fallbacks: number;
    /** Each seed's run value (`RunScore.value`), in seed order; absent when a run could not be scored. */
    values?: number[];
    /** Tokens paid to Jev, and tokens answered from the answer cache instead. */
    paidTokens?: number;
    cachedTokens?: number;
};

/** One benchmark of a level, summarised over its seeds. */
export type BenchResult = {
    kind: 'benchmark';
    name: string;
    brain: string;
    runs: number;
    meanScore: number;
    /** Sample standard deviation of the per-seed scores. */
    sdScore: number;
    refused: number;
    fallbacks: number;
    /** Each seed's score, in seed order. */
    scores?: number[];
    paidTokens?: number;
    cachedTokens?: number;
};

export type ItemResult = RungResult | BenchResult;

export type LevelResult = {
    id: string;
    seeds: Level['seeds'];
    timeoutSeconds: number;
    items: ItemResult[];
};

export type Verdict = { item: string; status: 'ok' | 'regressed' | 'new' | 'incomparable'; detail: string };

const median = (xs: readonly number[]) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

type RunCost = { seed: number; refused: number; fallbacks: number; inputTokens?: number; cachedTokens?: number };

const sum = <T>(runs: readonly T[], of: (run: T) => number | undefined) => runs.reduce((a, r) => a + (of(r) ?? 0), 0);

export function summariseRung(
    name: string,
    unordered: readonly (RunCost & { killed: boolean; seconds: number; score?: { value: number } | null })[],
): RungResult {
    const runs = [...unordered].sort((a, b) => a.seed - b.seed);
    const values = runs.flatMap((r) => (r.score ? [r.score.value] : []));
    return {
        kind: 'rung',
        name,
        runs: runs.length,
        kills: runs.filter((r) => r.killed).length,
        medianSeconds: median(runs.filter((r) => r.killed).map((r) => r.seconds)),
        refused: sum(runs, (r) => r.refused),
        fallbacks: sum(runs, (r) => r.fallbacks),
        ...(values.length === runs.length ? { values } : {}),
        paidTokens: sum(runs, (r) => r.inputTokens),
        cachedTokens: sum(runs, (r) => r.cachedTokens),
    };
}

export function summariseBench(
    name: string,
    brain: string,
    unordered: readonly (RunCost & { metrics: { score: number } })[],
): BenchResult {
    const runs = [...unordered].sort((a, b) => a.seed - b.seed);
    const scores = runs.map((r) => r.metrics.score);
    const mean = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);
    const variance = scores.length > 1 ? scores.reduce((a, s) => a + (s - mean) ** 2, 0) / (scores.length - 1) : 0;
    return {
        kind: 'benchmark',
        name,
        brain,
        runs: runs.length,
        meanScore: mean,
        sdScore: Math.sqrt(variance),
        refused: sum(runs, (r) => r.refused),
        fallbacks: sum(runs, (r) => r.fallbacks),
        scores,
        paidTokens: sum(runs, (r) => r.inputTokens),
        cachedTokens: sum(runs, (r) => r.cachedTokens),
    };
}

/**
 * Lowest kill count on `runs` seeds still within seed noise of a baseline of `kills` / `baselineRuns`.
 * The baseline rate is smoothed by half a kill each way, so 8/8 does not make one miss a regression and
 * 0/8 cannot fall at all; the bound is the one-sided normal approximation of the binomial.
 */
export function killNoiseFloor(kills: number, baselineRuns: number, runs: number, z: number) {
    const p = (kills + 0.5) / (baselineRuns + 1);
    return runs * p - z * Math.sqrt(runs * p * (1 - p));
}

function compareRung(base: RungResult, now: RungResult, rule: RegressionRule): Verdict {
    const floor = killNoiseFloor(base.kills, base.runs, now.runs, rule.z);
    if (now.kills < floor) {
        return {
            item: now.name,
            status: 'regressed',
            detail: `kills ${now.kills}/${now.runs} below noise floor ${floor.toFixed(1)} of baseline ${base.kills}/${base.runs}`,
        };
    }
    if (
        base.medianSeconds !== null &&
        now.medianSeconds !== null &&
        Math.min(base.kills, now.kills) >= rule.minKillsForMedian &&
        now.medianSeconds > base.medianSeconds * (1 + rule.medianSlowdown)
    ) {
        return {
            item: now.name,
            status: 'regressed',
            detail: `median ${now.medianSeconds.toFixed(1)} s over ${(base.medianSeconds * (1 + rule.medianSlowdown)).toFixed(1)} s (baseline ${base.medianSeconds.toFixed(1)} s + ${rule.medianSlowdown * 100}%)`,
        };
    }
    const value = pairedSeeds(base.values, now.values);
    if (value && value.ci[1] < 0 && -value.meanDiff > rule.minValueDrop) {
        return { item: now.name, status: 'regressed', detail: `run value ${pairedText(value)} against the baseline` };
    }
    return {
        item: now.name,
        status: 'ok',
        detail: `kills ${now.kills}/${now.runs} (baseline ${base.kills}/${base.runs}), median ${now.medianSeconds?.toFixed(1) ?? '–'} s (baseline ${base.medianSeconds?.toFixed(1) ?? '–'} s)${value ? `, run value ${pairedText(value)}` : ''}`,
    };
}

/** The seed-by-seed comparison, when both sides kept every seed's number. */
function pairedSeeds(base: readonly number[] | undefined, now: readonly number[] | undefined) {
    return base && now && base.length === now.length && now.length > 1 ? pairedComparison(base, now) : undefined;
}

function compareBench(base: BenchResult, now: BenchResult, rule: RegressionRule): Verdict {
    const paired = pairedSeeds(base.scores, now.scores);
    if (paired) {
        return {
            item: now.name,
            status: paired.ci[1] < 0 && -paired.meanDiff > rule.minScoreDrop ? 'regressed' : 'ok',
            detail: `score ${now.meanScore.toFixed(3)} (baseline ${base.meanScore.toFixed(3)}), seed by seed ${pairedText(paired)}`,
        };
    }
    const noise = rule.z * Math.sqrt(base.sdScore ** 2 / base.runs + now.sdScore ** 2 / now.runs);
    const allowed = Math.max(rule.minScoreDrop, noise);
    const drop = base.meanScore - now.meanScore;
    return {
        item: now.name,
        status: drop > allowed ? 'regressed' : 'ok',
        detail: `score ${now.meanScore.toFixed(3)} (baseline ${base.meanScore.toFixed(3)}, allowed drop ${allowed.toFixed(3)})`,
    };
}

/**
 * Compares a level's results with its baseline item by item. Items are comparable only on the same
 * seeds and timeout; anything else is reported, never silently compared.
 */
export function compareLevel(base: LevelResult | undefined, now: LevelResult, rule: RegressionRule): Verdict[] {
    return now.items.map((item) => {
        const old = base?.items.find((b) => b.kind === item.kind && b.name === item.name);
        if (!base || !old) {
            return { item: item.name, status: 'new', detail: 'no baseline' };
        }
        if (
            base.seeds.first !== now.seeds.first ||
            base.seeds.count !== now.seeds.count ||
            base.timeoutSeconds !== now.timeoutSeconds
        ) {
            return { item: item.name, status: 'incomparable', detail: 'baseline played other seeds or timeout' };
        }
        return item.kind === 'rung'
            ? compareRung(old as RungResult, item, rule)
            : compareBench(old as BenchResult, item, rule);
    });
}

/** Whether every rung of a level reaches the level's acceptance thresholds. */
export function levelAccepted(level: Level, result: LevelResult) {
    return result.items.every(
        (item) =>
            item.kind !== 'rung' ||
            (item.kills / item.runs >= level.accept.killRate &&
                (level.accept.medianSeconds === undefined ||
                    (item.medianSeconds !== null && item.medianSeconds <= level.accept.medianSeconds))),
    );
}
