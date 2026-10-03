/**
 * Scores brain versions on a station benchmark, every brain on the same seeds.
 *
 *   npm run bench -- --bench helms-tag --seeds 8 --brain brains/helms.v6.json --brain brains/helms.v7.json [--policy jev] [--workers 2] [--out <dir>]
 *
 * `--policy reference` scores the hand-written rules instead (a sanity check of the benchmark).
 * Jev answers come from the answer cache when it holds them (`--no-cache`, `--cache-dir <dir>`).
 * Recordings land in `<out>/<brain>.v<N>-<policy>/<bench>_seed<N>.sgr`; the report in `<out>/<bench>.md`.
 */
import { BenchmarkRunResult, runBenchmark } from '../benchmarks/run-benchmark';
import { isSignificant, pairedComparison, pairedText } from '../training/paired';

import { JEV_DOLLARS_PER_MILLION_TOKENS } from '../training/report';
import { applyCacheFlags } from '../brain/jev-cache';
import { fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Job = {
    brains: string[];
    seeds: number[];
    options: Omit<Parameters<typeof runBenchmark>[0], 'seed' | 'brainPath'>;
};

const JEV_REQUESTS_PER_MINUTE = 1000;

function arg(name: string, fallback: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

function args(name: string) {
    return process.argv.flatMap((a, i) => (a === `--${name}` ? [process.argv[i + 1]] : []));
}

async function runJob(job: Job) {
    const results: BenchmarkRunResult[] = [];
    for (const seed of job.seeds) {
        for (const brainPath of job.brains) {
            results.push(await runBenchmark({ ...job.options, brainPath, seed }));
        }
    }
    return results;
}

function report(benchmark: string, results: BenchmarkRunResult[], header: string, baseline: string) {
    const brains = [...new Set(results.map((r) => r.brain))];
    const metricNames = [...new Set(results.flatMap((r) => Object.keys(r.metrics)))];
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const lines = [
        `# Benchmark: ${benchmark}`,
        '',
        header,
        '',
        `| brain | runs | ${metricNames.map((m) => `mean ${m}`).join(' | ')} | refused | fallbacks | paid tokens | cached tokens (hits) | cost ($) |`,
        `| --- | --- | ${metricNames.map(() => '---').join(' | ')} | --- | --- | --- | --- | --- |`,
    ];
    for (const brain of brains) {
        const runs = results.filter((r) => r.brain === brain);
        const tokens = runs.reduce((a, r) => a + r.inputTokens, 0);
        lines.push(
            `| ${brain} | ${runs.length} | ${metricNames.map((m) => mean(runs.map((r) => r.metrics[m] ?? NaN)).toFixed(2)).join(' | ')} | ${runs.reduce((a, r) => a + r.refused, 0)} | ${runs.reduce((a, r) => a + r.fallbacks, 0)} | ${tokens} | ${runs.reduce((a, r) => a + r.cachedTokens, 0)} (${runs.reduce((a, r) => a + r.cacheHits, 0)}) | ${((tokens / 1e6) * JEV_DOLLARS_PER_MILLION_TOKENS).toFixed(3)} |`,
        );
    }
    if (brains.length > 1) {
        lines.push(
            '',
            `| brain | score against ${baseline}, seed by seed: difference [95% interval] | verdict |`,
            '| --- | --- | --- |',
        );
        const scores = (brain: string) => new Map(results.filter((r) => r.brain === brain).map((r) => [r.seed, r]));
        const base = scores(baseline);
        for (const brain of brains.filter((b) => b !== baseline)) {
            const mine = scores(brain);
            const seeds = [...mine.keys()].filter((seed) => base.has(seed));
            const c = pairedComparison(
                seeds.map((seed) => base.get(seed)!.metrics.score),
                seeds.map((seed) => mine.get(seed)!.metrics.score),
            );
            lines.push(
                `| ${brain} | ${pairedText(c)} | ${isSignificant(c) ? (c.meanDiff > 0 ? 'better' : 'worse') : 'within noise'} |`,
            );
        }
    }
    lines.push('', '| brain | seed | seconds | score | recording |', '| --- | --- | --- | --- | --- |');
    for (const r of results) {
        lines.push(
            `| ${r.brain} | ${r.seed} | ${r.seconds.toFixed(1)} | ${r.metrics.score.toFixed(2)} | ${r.recording} |`,
        );
    }
    return lines.join('\n') + '\n';
}

if (process.send) {
    process.once('message', (job: Job) => {
        void runJob(job).then((results) => process.send?.(results, () => process.exit(0)));
    });
} else {
    void main();
}

async function main() {
    applyCacheFlags();
    const benchmark = arg('bench', '');
    const brains = args('brain').map((b) => path.resolve(b));
    if (!benchmark || !brains.length) {
        throw new Error(
            'usage: bench --bench <name> --brain <brain.json> [--brain ...] [--seeds 8] [--policy jev|reference|idle]',
        );
    }
    const seedCount = Number(arg('seeds', '8'));
    const firstSeed = Number(arg('first-seed', '1'));
    const workers = Math.max(1, Math.min(Number(arg('workers', '1')), seedCount));
    const outDir = path.resolve(arg('out', path.join(os.tmpdir(), 'starwards-bench')));
    const options: Job['options'] = {
        benchmark,
        policy: arg('policy', 'jev') as Job['options']['policy'],
        outDir,
        latencySeconds: Number(arg('latency', '0.2')),
        jevRequestsPerMinute: JEV_REQUESTS_PER_MINUTE / workers,
    };
    const shards: number[][] = Array.from({ length: workers }, () => []);
    for (let i = 0; i < seedCount; i++) shards[i % workers].push(firstSeed + i);
    const started = Date.now();
    const results =
        workers === 1
            ? await runJob({ brains, seeds: shards[0], options })
            : (
                  await Promise.all(
                      shards.map(
                          (seeds) =>
                              new Promise<BenchmarkRunResult[]>((resolve, reject) => {
                                  const child = fork(__filename, [], { execArgv: process.execArgv });
                                  child.once('message', (r) => resolve(r as BenchmarkRunResult[]));
                                  child.once('error', reject);
                                  child.once('exit', (code) => code && reject(new Error(`worker exit ${code}`)));
                                  child.send({ brains, seeds, options } satisfies Job);
                              }),
                      ),
                  )
              ).flat();
    // every other brain is paired with the first one named
    const baseline = results[0].brain;
    results.sort((a, b) => a.seed - b.seed || a.brain.localeCompare(b.brain));
    const text = report(
        benchmark,
        results,
        `seeds ${firstSeed}–${firstSeed + seedCount - 1}, policy ${options.policy}, ${workers} worker(s), wall ${((Date.now() - started) / 1000).toFixed(0)} s`,
        baseline,
    );
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `${benchmark}.md`), text);
    fs.writeFileSync(path.join(outDir, `${benchmark}.json`), JSON.stringify(results, null, 2));
    process.stdout.write(text);
}
