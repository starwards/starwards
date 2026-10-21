import { WAVE_METRICS, WaveFitness, bootstrapMeanCI } from '../scoring/wave-fitness';
import { isSignificant, pairedComparison } from './paired';

/** One crew's run of one seed of a wave rung or cut, scored by its continuous fitness. */
export type WaveRun = { crew: string; seed: number; wallSeconds: number; fitness: WaveFitness };

const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(3)}`;
const interval = ([low, high]: readonly number[]) => `[${signed(low)}, ${signed(high)}]`;
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

/**
 * Every other crew against `baseline`, seed by seed, on each wave fitness metric: the means, the
 * mean difference (candidate − baseline) with its t interval, the percentile bootstrap interval of
 * the same differences, and a verdict oriented by the metric's better direction (significant only
 * when both intervals leave zero out).
 */
export function waveCompareSection(runs: readonly WaveRun[], baseline: string): string[] {
    const bySeed = (crew: string) => new Map(runs.filter((r) => r.crew === crew).map((r) => [r.seed, r]));
    const base = bySeed(baseline);
    const lines = [
        `wall ${mean(runs.map((r) => r.wallSeconds)).toFixed(1)} s per run, ${runs.length} runs`,
        '',
        `| crew | metric | seeds | mean ${baseline} | mean crew | difference [95% t interval] | 95% bootstrap | verdict |`,
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ];
    for (const crew of [...new Set(runs.map((r) => r.crew))].filter((c) => c !== baseline)) {
        const mine = bySeed(crew);
        const seeds = [...mine.keys()].filter((s) => base.has(s)).sort((a, b) => a - b);
        for (const { name, higherIsBetter } of WAVE_METRICS) {
            const b = seeds.map((s) => base.get(s)!.fitness[name]);
            const c = seeds.map((s) => mine.get(s)!.fitness[name]);
            const t = pairedComparison(b, c);
            const boot = bootstrapMeanCI(c.map((x, i) => x - b[i]));
            const significant = isSignificant(t) && (boot[0] > 0 || boot[1] < 0);
            const verdict = !significant ? 'within noise' : t.meanDiff > 0 === higherIsBetter ? 'better' : 'worse';
            lines.push(
                `| ${crew} | ${name} | ${seeds.length} | ${mean(b).toFixed(3)} | ${mean(c).toFixed(3)} | ${signed(t.meanDiff)} ${interval(t.ci)} | ${interval(boot)} | ${verdict} |`,
            );
        }
    }
    return lines;
}
