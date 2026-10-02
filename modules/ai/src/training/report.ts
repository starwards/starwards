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

/**
 * Compares crews that played the same seeds: outcome first, then how each control was played, so a
 * change of brain shows both whether it won more and which decisions changed.
 */
export function crewReport(scenario: string, results: readonly CrewRunResult[], header: string) {
    const crews = [...new Set(results.map((r) => r.crew))];
    const lines = [
        `# Crew training: ${scenario}`,
        '',
        header,
        '',
        '| crew | brains | kills | time to kill p10 / median / p90 (s) | shells | decisions | fallbacks | refused | callouts said / suppressed | paid tokens | cached tokens (hits / requests) | cost ($) |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ];
    for (const crew of crews) {
        const runs = results.filter((r) => r.crew === crew);
        const kills = runs.filter((r) => r.killed).map((r) => r.seconds);
        const sum = (f: (r: CrewRunResult) => number) => runs.reduce((a, r) => a + f(r), 0);
        const tokens = sum((r) => r.inputTokens);
        lines.push(
            `| ${crew} | ${runs[0].brains.join(', ')} | ${kills.length}/${runs.length} | ${fmt(quantile(kills, 0.1))} / ${fmt(median(kills))} / ${fmt(quantile(kills, 0.9))} | ${fmt(median(runs.map((r) => r.shellsFired)), 0)} | ${sum((r) => r.decisions)} | ${sum((r) => r.fallbacks)} | ${sum((r) => r.refused)} | ${sum((r) => r.callouts)} / ${sum((r) => r.suppressed)} | ${tokens} | ${sum((r) => r.cachedTokens)} (${sum((r) => r.cacheHits)} / ${sum((r) => r.jevRequests)}) | ${fmt((tokens / 1e6) * JEV_DOLLARS_PER_MILLION_TOKENS, 3)} |`,
        );
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
