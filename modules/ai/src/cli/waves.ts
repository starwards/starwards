/**
 * Plays crews on the same seeds of a wave rung or W-cut scenario and compares them on continuous
 * wave fitness (`scoring/wave-fitness.ts`): paired mean difference against the first crew, with its
 * t and bootstrap 95% intervals, per metric.
 *
 *   npm --prefix modules/ai run waves -- --scenario W-cut-lof --crew crews/a.json --crew crews/b.json [--seeds 16] [--first-seed 1] [--timeout 480] [--workers 2] [--out <dir>]
 *   npm --prefix modules/ai run waves -- --results <out>/<scenario>-waves.json [--baseline <crew>]
 *   npm --prefix modules/ai run waves -- --sequential --crew <baseline.json> --crew <candidate.json> [--looks 32,64,128,192] [--first-seed 1] [--workers 4] [--out <dir>]
 *   ... --baseline-results <a>/W-cut-lof-waves.json,<b>/W-cut-lof-waves.json
 *
 * `--sequential` plays seeds in batches up to each look of a group-sequential screen on pass
 * (`training/paired.ts` sequentialScreen) and stops once every candidate crossed a boundary (better,
 * worse or futile) against the first crew, instead of a fixed `--seeds`.
 *
 * `--baseline-results` (comma-separated or repeated) reuses the first crew's rows of earlier results
 * files for the seeds they cover and plays only the candidates there; same scenario, timeout and
 * latency assumed.
 *
 * Recordings land in `<out>/<crew>/<scenario>_seed<N>.sgr` (a frame every 5 s), the runs in
 * `<out>/<scenario>-waves.json`, the report in `<out>/<scenario>-waves.md`.
 */
import { SEQUENTIAL_LOOKS, sequentialScreen, sequentialText } from '../training/paired';
import { WaveRun, waveCompareSection } from '../training/wave-compare';
import { idealScript, parseIdeals } from '../training/ideal';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { ammoTelemetry } from '../training/ammo-telemetry';
import { applyCacheFlags } from '../brain/jev-cache';
import { baselineCache } from '../training/baseline-cache';
import { fork } from 'node:child_process';
import fs from 'node:fs';
import { missileTelemetry } from '../training/missile-telemetry';
import os from 'node:os';
import path from 'node:path';
import { playCrewTraining } from '../training/train-crew';
import { waveFitness } from '../scoring/wave-fitness';

type Job = {
    crews: string[];
    seeds: number[];
    scenario: string;
    timeoutSeconds: number;
    outDir: string;
    latencySeconds: number;
    /** Seeds whose first-crew run is cached (`--baseline-results`): played by the other crews only. */
    cachedSeeds?: number[];
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
            if (crewSpec === job.crews[0] && job.cachedSeeds?.includes(seed)) continue;
            // `<crew.json>#<ideal>,<ideal>` plays the crew on an idealized GVTS (training/ideal.ts)
            const [crewPath, ideals = ''] = crewSpec.split('#');
            const ideal = idealScript(parseIdeals(ideals));
            const telemetry = ammoTelemetry();
            const missiles = missileTelemetry();
            let ended: HeadlessGame | undefined;
            const script = (game: HeadlessGame) => {
                ideal?.(game);
                telemetry.tick(game);
                missiles.tick(game);
                ended = game;
            };
            const started = Date.now();
            const result = await playCrewTraining(crewPath, {
                script,
                scenario: job.scenario,
                seed,
                timeoutSeconds: job.timeoutSeconds,
                latencySeconds: job.latencySeconds,
                // each variant records into its own dir: the crew's name alone is shared across variants
                outDir: ideals ? path.join(job.outDir, ideals.replace(/,/g, '+')) : job.outDir,
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
                ammo: ended && telemetry.report(ended),
                missiles: missiles.report(),
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
    const sequential = process.argv.includes('--sequential');
    // one crew plays alone to fill a baseline cache (`--baseline-results`)
    if (crews.length < (sequential ? 2 : 1)) {
        throw new Error('usage: waves --scenario <rung> --crew <baseline.json> --crew <candidate.json> [...]');
    }
    const looks = sequential ? arg('looks', SEQUENTIAL_LOOKS.join(',')).split(',').map(Number) : [];
    const seedCount = sequential ? looks[looks.length - 1] : Number(arg('seeds', '16'));
    const firstSeed = Number(arg('first-seed', '1'));
    const workers = Math.max(1, Number(arg('workers', '1')));
    const outDir = path.resolve(arg('out', path.join(os.tmpdir(), 'starwards-waves')));
    const base = {
        crews,
        scenario,
        timeoutSeconds: Number(arg('timeout', '480')),
        outDir,
        latencySeconds: Number(arg('latency', '0.2')),
    };
    const cache = baselineCache(
        args('baseline-results')
            .flatMap((f) => f.split(','))
            .map((f) => JSON.parse(fs.readFileSync(f, 'utf8')) as WaveRun[]),
        crewName(crews[0]),
    );
    const playSeeds = async (seeds: number[], jobCrews: string[]) => [
        ...seeds.flatMap((s) => (cache.has(s) ? [cache.get(s)!] : [])),
        ...(await playFresh(seeds, jobCrews)),
    ];
    const cachedSeeds = [...cache.keys()];
    const playFresh = async (seeds: number[], jobCrews: string[]) => {
        const shards: number[][] = Array.from({ length: Math.min(workers, seeds.length) }, () => []);
        seeds.forEach((seed, i) => shards[i % shards.length].push(seed));
        return (
            await Promise.all(
                shards.map((s) =>
                    shards.length === 1
                        ? runJob({ ...base, crews: jobCrews, seeds: s, cachedSeeds })
                        : new Promise<WaveRun[]>((resolve, reject) => {
                              const child = fork(__filename, [], { execArgv: process.execArgv });
                              child.once('message', (r) => resolve(r as WaveRun[]));
                              child.once('error', reject);
                              child.once('exit', (code) => code && reject(new Error(`worker exit ${code}`)));
                              child.send({ ...base, crews: jobCrews, seeds: s, cachedSeeds } satisfies Job);
                          }),
                ),
            )
        ).flat();
    };
    const started = Date.now();
    const seedsFrom = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => firstSeed + from + i);
    let runs: WaveRun[] = [];
    let played = seedCount;
    if (!sequential) {
        runs = await playSeeds(seedsFrom(0, seedCount), crews);
    } else {
        // candidates leave the batch once their screen stops; the baseline plays every seed any of them needs
        let open = crews.slice(1);
        let from = 0;
        for (const look of looks) {
            if (!open.length) break;
            runs.push(...(await playSeeds(seedsFrom(from, look), [crews[0], ...open])));
            from = played = look;
            open = open.filter((c) => sequentialFor(runs, crewName(crews[0]), crewName(c)).decision === 'continue');
        }
    }
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `${scenario}-waves.json`);
    fs.writeFileSync(outFile, JSON.stringify(runs, null, 2));
    const header = `${scenario}, seeds ${firstSeed}–${firstSeed + played - 1}${sequential ? ` (sequential, looks ${looks.join('/')})` : ''}, timeout ${base.timeoutSeconds} s, ${workers} worker(s), total wall ${((Date.now() - started) / 1000).toFixed(0)} s`;
    return { runs, header, outFile };
}

function crewName(spec: string) {
    const [file, ideals] = spec.split('#');
    return path.basename(file, '.json') + (ideals ? `#${ideals}` : '');
}

/** The sequential screen on pass of `candidate` against `baseline` over the seeds both played, in seed order. */
function sequentialFor(runs: readonly WaveRun[], baseline: string, candidate: string) {
    const passOf = (crew: string) =>
        new Map(runs.filter((r) => r.crew === crew).map((r) => [r.seed, Number(r.passed)]));
    const b = passOf(baseline);
    const c = passOf(candidate);
    const seeds = [...c.keys()].filter((s) => b.has(s)).sort((x, y) => x - y);
    return sequentialScreen(
        seeds.map((s) => b.get(s)!),
        seeds.map((s) => c.get(s)!),
    );
}

async function main() {
    applyCacheFlags();
    const [results] = args('results');
    const { runs, header, outFile } = results
        ? { runs: JSON.parse(fs.readFileSync(results, 'utf8')) as WaveRun[], header: results, outFile: results }
        : await play();
    const [baseline = runs[0].crew] = args('baseline');
    const screens = [...new Set(runs.map((r) => r.crew))]
        .filter((c) => c !== baseline)
        .map((c) => `- ${c}: ${sequentialText(sequentialFor(runs, baseline, c))}`);
    const text =
        [
            `# Wave fitness: ${header}`,
            '',
            '## Sequential screen on pass (vs baseline)',
            '',
            ...screens,
            '',
            ...waveCompareSection(runs, baseline),
        ].join('\n') + '\n';
    fs.writeFileSync(outFile.replace(/\.json$/, '.md'), text);
    process.stdout.write(text);
}
