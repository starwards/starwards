/**
 * Plays crews on the same seeds of a wave rung or W-cut scenario and compares them on continuous
 * wave fitness (`scoring/wave-fitness.ts`): paired mean difference against the first crew, with its
 * t and bootstrap 95% intervals, per metric.
 *
 *   npm --prefix modules/ai run waves -- --scenario W-cut-lof --crew crews/a.json --crew crews/b.json [--seeds 16] [--first-seed 1] [--timeout 480] [--workers 2] [--out <dir>]
 *   npm --prefix modules/ai run waves -- --results <out>/<scenario>-waves.json [--baseline <crew>]
 *
 * Recordings land in `<out>/<crew>/<scenario>_seed<N>.sgr` (a frame every 5 s), the runs in
 * `<out>/<scenario>-waves.json`, the report in `<out>/<scenario>-waves.md`.
 */
import { WaveRun, waveCompareSection } from '../training/wave-compare';

import { applyCacheFlags } from '../brain/jev-cache';
import { fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { playCrewTraining } from '../training/train-crew';
import { waveFitness } from '../scoring/wave-fitness';
import { idealScript, parseIdeals } from '../training/ideal';

type Job = {
    crews: string[];
    seeds: number[];
    scenario: string;
    timeoutSeconds: number;
    outDir: string;
    latencySeconds: number;
};

function arg(name: string, fallback: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

function args(name: string) {
    return process.argv.flatMap((a, i) => (a === `--${name}` ? [process.argv[i + 1]] : []));
}

async function runJob(job: Job) {
    const runs: WaveRun[] = [];
    for (const seed of job.seeds) {
        for (const crewSpec of job.crews) {
            // `<crew.json>#<ideal>,<ideal>` plays the crew on an idealized GVTS (training/ideal.ts)
            const [crewPath, ideals = ''] = crewSpec.split('#');
            const script = idealScript(parseIdeals(ideals)) ?? undefined;
            const started = Date.now();
            const result = await playCrewTraining(crewPath, {
                script,
                scenario: job.scenario,
                seed,
                timeoutSeconds: job.timeoutSeconds,
                latencySeconds: job.latencySeconds,
                outDir: job.outDir,
                intervalSimSeconds: 5,
            });
            if (!result.waves) throw new Error(`${job.scenario} is not a wave rung`);
            runs.push({
                crew: path.basename(crewPath, '.json') + (ideals ? `#${ideals}` : ''),
                seed,
                wallSeconds: (Date.now() - started) / 1000,
                fitness: waveFitness(result.waves),
                passed: result.waves.passedAt !== null,
                stationsLost: result.waves.stationsLost,
                survived: result.waves.survived,
            });
        }
    }
    return runs;
}

if (process.send) {
    process.once('message', (job: Job) => {
        void runJob(job).then((runs) => process.send?.(runs, () => process.exit(0)));
    });
} else {
    void main();
}

async function play(): Promise<{ runs: WaveRun[]; header: string; outFile: string }> {
    const scenario = arg('scenario', 'W-cut-lof');
    const crews = args('crew').map((c) => {
        const [file, ideals] = c.split('#');
        return path.resolve(file) + (ideals ? `#${ideals}` : '');
    });
    if (crews.length < 2) {
        throw new Error('usage: waves --scenario <rung> --crew <baseline.json> --crew <candidate.json> [...]');
    }
    const seedCount = Number(arg('seeds', '16'));
    const firstSeed = Number(arg('first-seed', '1'));
    const workers = Math.max(1, Math.min(Number(arg('workers', '1')), seedCount));
    const outDir = path.resolve(arg('out', path.join(os.tmpdir(), 'starwards-waves')));
    const base = {
        crews,
        scenario,
        timeoutSeconds: Number(arg('timeout', '480')),
        outDir,
        latencySeconds: Number(arg('latency', '0.2')),
    };
    const shards: number[][] = Array.from({ length: workers }, () => []);
    for (let i = 0; i < seedCount; i++) shards[i % workers].push(firstSeed + i);
    const started = Date.now();
    const runs = (
        await Promise.all(
            shards.map((seeds) =>
                workers === 1
                    ? runJob({ ...base, seeds })
                    : new Promise<WaveRun[]>((resolve, reject) => {
                          const child = fork(__filename, [], { execArgv: process.execArgv });
                          child.once('message', (r) => resolve(r as WaveRun[]));
                          child.once('error', reject);
                          child.once('exit', (code) => code && reject(new Error(`worker exit ${code}`)));
                          child.send({ ...base, seeds } satisfies Job);
                      }),
            ),
        )
    ).flat();
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `${scenario}-waves.json`);
    fs.writeFileSync(outFile, JSON.stringify(runs, null, 2));
    const header = `${scenario}, seeds ${firstSeed}–${firstSeed + seedCount - 1}, timeout ${base.timeoutSeconds} s, ${workers} worker(s), total wall ${((Date.now() - started) / 1000).toFixed(0)} s`;
    return { runs, header, outFile };
}

async function main() {
    applyCacheFlags();
    const [results] = args('results');
    const { runs, header, outFile } = results
        ? { runs: JSON.parse(fs.readFileSync(results, 'utf8')) as WaveRun[], header: results, outFile: results }
        : await play();
    const [baseline = runs[0].crew] = args('baseline');
    const text = [`# Wave fitness: ${header}`, '', ...waveCompareSection(runs, baseline)].join('\n') + '\n';
    fs.writeFileSync(outFile.replace(/\.json$/, '.md'), text);
    process.stdout.write(text);
}
