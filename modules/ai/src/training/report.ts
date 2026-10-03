import { isSignificant, pairedComparison } from './paired';

import { CrewRunResult } from './train-crew';
import { median } from '@starwards/server/src/test/training/gunnery-metrics';

/** Published input price of `jev-1.13.0`, US dollars per million input tokens (output tokens are free). */
export const JEV_DOLLARS_PER_MILLION_TOKENS = 0.042;

function quantile(values: readonly number[], q: number) {
    if (!values.length) return NaN;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

const fmt = (n: number, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : '–');
const meanOf = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** What a paired comparison is made on: one number per run. `better` says which way is good. */
const PAIRED_METRICS: { name: string; of: (r: CrewRunResult) => number | undefined; better: 'higher' | 'lower' }[] = [
    { name: 'run value', of: (r) => r.score?.value, better: 'higher' },
    { name: 'killed', of: (r) => (r.killed ? 1 : 0), better: 'higher' },
    { name: 'seconds', of: (r) => r.seconds, better: 'lower' },
    { name: 'tactical score', of: (r) => r.score?.tactical, better: 'higher' },
    { name: 'opportunity (helms)', of: (r) => r.score?.opportunity, better: 'higher' },
    { name: 'conversion (weapons)', of: (r) => r.score?.conversion, better: 'higher' },
    { name: 'helms score', of: (r) => r.score?.helms, better: 'higher' },
    { name: 'weapons score', of: (r) => r.score?.weapons, better: 'higher' },
    { name: 'engineer score', of: (r) => r.score?.engineer, better: 'higher' },
];

/**
 * Every other crew against `baseline`, seed by seed on the seeds both played: the mean difference
 * with its 95% interval, how many seeds went each way, and the sign test. A metric a run lacks (no
 * score) is left out for that pair.
 */
export function pairedSection(results: readonly CrewRunResult[], baseline: string) {
    const lines = [
        `## Paired with ${baseline}, seed by seed`,
        '',
        `| crew | metric | seeds | ${baseline} | crew | difference [95% interval] | seeds up / down / same | sign p | verdict |`,
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ];
    const bySeed = (crew: string) => new Map(results.filter((r) => r.crew === crew).map((r) => [r.seed, r]));
    const base = bySeed(baseline);
    const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    for (const crew of new Set(results.map((r) => r.crew))) {
        if (crew === baseline) continue;
        const mine = bySeed(crew);
        const seeds = [...mine.keys()].filter((seed) => base.has(seed)).sort((a, b) => a - b);
        for (const metric of PAIRED_METRICS) {
            const a = seeds.map((seed) => metric.of(base.get(seed)!));
            const b = seeds.map((seed) => metric.of(mine.get(seed)!));
            if (!seeds.length || [...a, ...b].some((v) => v === undefined || !Number.isFinite(v))) continue;
            const c = pairedComparison(a as number[], b as number[]);
            const digits = metric.name === 'seconds' ? 1 : 3;
            const good = metric.better === 'higher' ? c.meanDiff > 0 : c.meanDiff < 0;
            const sign = (n: number) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n), digits)}`;
            lines.push(
                `| ${crew} | ${metric.name} (${metric.better} is better) | ${seeds.length} | ${fmt(mean(a as number[]), digits)} | ${fmt(mean(b as number[]), digits)} | ${sign(c.meanDiff)} [${sign(c.ci[0])}, ${sign(c.ci[1])}] | ${c.wins} / ${c.losses} / ${c.ties} | ${fmt(c.signP, 3)} | ${isSignificant(c) ? (good ? 'better' : 'worse') : 'within noise'} |`,
            );
        }
    }
    return lines;
}

/**
 * Compares crews that played the same seeds: outcome first, then each crew paired with `baseline`
 * (default: the first crew) seed by seed, then how each control was played, so a change of brain
 * shows whether it won more, whether that is beyond seed noise, and which decisions changed.
 */
export function crewReport(scenario: string, results: readonly CrewRunResult[], header: string, baseline?: string) {
    const crews = [...new Set(results.map((r) => r.crew))];
    const lines = [
        `# Crew training: ${scenario}`,
        '',
        header,
        '',
        '| crew | brains | kills | time to kill p10 / median / p90 (s) | run value | shells | decisions | fallbacks | refused | callouts said / suppressed | paid tokens | cached tokens (hits / requests) | cost ($) |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ];
    for (const crew of crews) {
        const runs = results.filter((r) => r.crew === crew);
        const kills = runs.filter((r) => r.killed).map((r) => r.seconds);
        const sum = (f: (r: CrewRunResult) => number) => runs.reduce((a, r) => a + f(r), 0);
        const tokens = sum((r) => r.inputTokens);
        lines.push(
            `| ${crew} | ${runs[0].brains.join(', ')} | ${kills.length}/${runs.length} | ${fmt(quantile(kills, 0.1))} / ${fmt(median(kills))} / ${fmt(quantile(kills, 0.9))} | ${fmt(meanOf(runs.flatMap((r) => (r.score ? [r.score.value] : []))), 3)} | ${fmt(median(runs.map((r) => r.shellsFired)), 0)} | ${sum((r) => r.decisions)} | ${sum((r) => r.fallbacks)} | ${sum((r) => r.refused)} | ${sum((r) => r.callouts)} / ${sum((r) => r.suppressed)} | ${tokens} | ${sum((r) => r.cachedTokens)} (${sum((r) => r.cacheHits)} / ${sum((r) => r.jevRequests)}) | ${fmt((tokens / 1e6) * JEV_DOLLARS_PER_MILLION_TOKENS, 3)} |`,
        );
    }
    if (crews.length > 1) {
        lines.push('', ...pairedSection(results, baseline ?? crews[0]));
    }
    lines.push(
        '',
        '## Controls',
        '',
        '| crew | control | decisions | mean confidence | choices |',
        '| --- | --- | --- | --- | --- |',
    );
    for (const crew of crews) {
        const merged: Record<
            string,
            { decisions: number; confident: number; confidenceSum: number; choices: Record<string, number> }
        > = {};
        for (const run of results.filter((r) => r.crew === crew)) {
            for (const [control, stats] of Object.entries(run.controls)) {
                const into = (merged[control] ??= { decisions: 0, confident: 0, confidenceSum: 0, choices: {} });
                into.decisions += stats.decisions;
                into.confident += stats.confident;
                into.confidenceSum += stats.confidenceSum;
                for (const [choice, n] of Object.entries(stats.choices))
                    into.choices[choice] = (into.choices[choice] ?? 0) + n;
            }
        }
        for (const [control, s] of Object.entries(merged).sort(([a], [b]) => a.localeCompare(b))) {
            const choices = Object.entries(s.choices)
                .sort(([, a], [, b]) => b - a)
                .map(([c, n]) => `${c} ${n}`)
                .join(', ');
            lines.push(
                `| ${crew} | ${control} | ${s.decisions} | ${s.confident ? fmt(s.confidenceSum / s.confident, 2) : '–'} | ${choices} |`,
            );
        }
    }
    lines.push(
        '',
        '## Runs',
        '',
        '| crew | seed | killed | seconds | shells | target health | failed checks | recording |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
    );
    for (const r of results) {
        lines.push(
            `| ${r.crew} | ${r.seed} | ${r.killed ? 'yes' : 'no'} | ${fmt(r.seconds)} | ${r.shellsFired} | ${fmt(r.targetHealth, 2)} | ${r.failedChecks.join(', ') || '–'} | ${r.recording ?? '–'} |`,
        );
    }
    return lines.join('\n') + '\n';
}
