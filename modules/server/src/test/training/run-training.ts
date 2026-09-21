/**
 * Runs a training scenario across seeds on every logical CPU, recording each run, and prints a
 * markdown report.
 *
 *   npm --prefix modules/server run training -- \
 *     --scenario T0 --seeds 64 --timeout 300 --interval 1 --hz 60 --out <dir>
 *
 * `--interval 0` disables recording. Recordings land in `<dir>/<scenario>_seed<N>.swr.jsonl`,
 * the report in `<dir>/<scenario>-report.md`.
 */
import { TrainingResult, TrainingRunOptions, runTraining, trainingScenarios } from './training-scenarios';

import { SERVER_TICK_HZ } from '../headless-game';
import { fork } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

interface WorkerJob {
    readonly scenario: string;
    readonly seeds: number[];
    readonly options: Omit<TrainingRunOptions, 'seed'>;
}

function arg(name: string, fallback: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

if (process.send) {
    process.on('message', (job: WorkerJob) => {
        void (async () => {
            const results: TrainingResult[] = [];
            for (const seed of job.seeds) {
                results.push(await runTraining(trainingScenarios[job.scenario], { seed, ...job.options }));
            }
            process.send?.(results, () => process.exit(0));
        })();
    });
} else {
    void main();
}

async function main() {
    const scenarioName = arg('scenario', 'T0');
    const scenario = trainingScenarios[scenarioName];
    if (!scenario) {
        throw new Error(`unknown scenario ${scenarioName}`);
    }
    const seedCount = Number(arg('seeds', '64'));
    const firstSeed = Number(arg('first-seed', '1'));
    const timeoutSeconds = Number(arg('timeout', '300'));
    const interval = Number(arg('interval', '1'));
    const hz = Number(arg('hz', String(SERVER_TICK_HZ)));
    const outDir = path.resolve(arg('out', path.join(os.tmpdir(), 'starwards-training')));
    const options: WorkerJob['options'] = {
        timeoutSeconds,
        hz,
        recording: interval > 0 ? { dir: outDir, intervalSimSeconds: interval } : undefined,
    };
    const workers = Math.min(os.cpus().length, seedCount);
    const shards: number[][] = Array.from({ length: workers }, () => []);
    for (let i = 0; i < seedCount; i++) {
        shards[i % workers].push(firstSeed + i);
    }
    const started = Date.now();
    const results = (
        await Promise.all(
            shards.map(
                (seeds) =>
                    new Promise<TrainingResult[]>((resolve, reject) => {
                        const child = fork(__filename, [], { execArgv: process.execArgv });
                        child.once('message', (r) => resolve(r as TrainingResult[]));
                        child.once('error', reject);
                        child.once('exit', (code) => code && reject(new Error(`worker exit ${code}`)));
                        child.send({ scenario: scenarioName, seeds, options } satisfies WorkerJob);
                    }),
            ),
        )
    )
        .flat()
        .sort((a, b) => a.seed - b.seed);
    const report = toMarkdown(scenario.description, results, workers, (Date.now() - started) / 1000, options);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `${scenarioName}-report.md`), report);
    process.stdout.write(report);
}

function median(values: number[]) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN;
}

const f = (n: number | null, d = 0) => (n === null || !Number.isFinite(n) ? '–' : n.toFixed(d));

function toMarkdown(
    description: string,
    results: TrainingResult[],
    workers: number,
    wallSeconds: number,
    options: WorkerJob['options'],
): string {
    const killed = results.filter((r) => r.killed);
    const ttk = killed.map((r) => r.seconds).sort((a, b) => a - b);
    const pct = (p: number) => (ttk.length ? ttk[Math.min(ttk.length - 1, Math.floor(ttk.length * p))] : NaN);
    const recording = options.recording
        ? `recording every ${options.recording.intervalSimSeconds} sim-s`
        : 'not recorded';
    return [
        `# Training ${results[0]?.scenario ?? ''}: ${description}`,
        '',
        `Timeout ${options.timeoutSeconds} sim-s, ${options.hz} Hz, ${results.length} seeds on ${workers} workers, ${f(wallSeconds)} s wall, ${recording}.`,
        '',
        `- Kill rate: **${killed.length}/${results.length}**`,
        `- TTK sim-s (killed): p10 ${f(pct(0.1))} / median ${f(pct(0.5))} / p90 ${f(pct(0.9))}`,
        `- Armor stripped: ${results.filter((r) => r.armorStrippedAt !== null).length}/${results.length}`,
        `- Any system damage (health < 1): ${results.filter((r) => r.targetHealth < 1).length}/${results.length}`,
        `- Median in-range fraction ${f(median(results.map((r) => r.inRangeFraction)), 2)}, in-kill-zone fraction ${f(median(results.map((r) => r.killZoneFraction)), 2)} (bot's belief)`,
        `- Blast hits on target (ground truth): median ${f(median(results.map((r) => r.blastHits)))}, seeds with none ${results.filter((r) => r.blastHits === 0).length}/${results.length}; median overlap ticks ${f(median(results.map((r) => r.overlapSamples)))}`,
        '',
        '| seed | params | killed | sim-s | armor stripped at | target health | shells | s firing | in range | in kill zone | blast hits | overlap ticks | target drift m | GVTS speed end | frames | wall s |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        ...results.map(
            (r) =>
                `| ${r.seed} | \`${JSON.stringify(r.params)}\` | ${r.killed ? 'yes' : 'no'} | ${f(r.seconds)} | ${f(r.armorStrippedAt)} | ${f(r.targetHealth, 2)} | ${r.shellsFired} | ${f(r.secondsFiring)} | ${f(r.inRangeFraction, 2)} | ${f(r.killZoneFraction, 2)} | ${r.blastHits} | ${r.overlapSamples} | ${f(r.targetDrift)} | ${f(r.gvtsSpeed)} | ${r.frames ?? '–'} | ${f(r.wallSeconds, 1)} |`,
        ),
        '',
    ].join('\n');
}
