/**
 * Searches the reference crew's numeric knobs (`REFERENCE_KNOB_DEFAULTS` in `@starwards/bots`) for
 * a better wave defence: a (μ/μ_w, λ)-ES with cumulative step-size adaptation over the knobs scaled
 * to [0, 1] within their ranges. Each generation plays the defaults, the current mean and λ samples
 * on the same window of training seeds through `waves`, so every candidate is paired with the
 * defaults. State is checkpointed to `<out>/state.json` after each generation; rerunning with the
 * same `--out` resumes.
 *
 *   npm --prefix modules/ai run search -- --out <dir> [--base crews/captain-reference-guard.json] [--lambda 8]
 *       [--seeds 16] [--seed-pool 101-164] [--timeout 1500] [--max-workers 12] [--generations 1000]
 */
import { REFERENCE_KNOB_DEFAULTS, ReferenceKnobs } from '@starwards/bots';

import { WaveRun } from '../training/wave-compare';
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type Knob = keyof ReferenceKnobs;

/** Search range of each knob; the defaults lie inside. */
const RANGES: Record<Knob, [number, number]> = {
    FIRE_ARC_DEGREES: [0.5, 6],
    LAUNCH_INTERVAL_SECONDS: [2, 20],
    STANDOFF_METERS: [200, 2500],
    ARMED_STANDOFF_METERS: [1000, 7000],
    WEAVE_METERS: [0, 1200],
    WEAVE_HZ: [0.02, 0.2],
    PURSUIT_METERS: [300, 4000],
    LINE_CLEARANCE_METERS: [100, 1500],
    GUN_HOLD_HEAT: [60, 99],
    PARKING_GAIN: [0.1, 0.8],
    REFOCUS_MARGIN_METERS: [500, 12_000],
    STATION_HELD_METERS: [3000, 25_000],
    STATION_HELD_SECONDS: [5, 90],
    SHELLS_LOW: [0.05, 0.7],
    GUARD_SLACK_METERS: [500, 8000],
    ATTACK_METERS: [6000, 40_000],
    RETARGET_MARGIN_METERS: [0, 8000],
    CONTACT_LOST_HOLD_SECONDS: [3, 40],
    GUN_BACKOFF_HEAT: [40, 95],
    GUN_RELEASE_HEAT: [15, 80],
    REPAIR_STORE: [0.05, 0.7],
    CLOSE_MARGIN_METERS: [0, 5000],
};
const KNOBS = Object.keys(RANGES) as Knob[];
const N = KNOBS.length;

function arg(name: string, fallback: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

/** Reflects into [0, 1]. */
const reflect = (u: number) => {
    const m = ((u % 2) + 2) % 2;
    return m > 1 ? 2 - m : m;
};

function knobsOf(x: number[]): Partial<ReferenceKnobs> {
    const knobs: Partial<ReferenceKnobs> = {};
    KNOBS.forEach((k, i) => {
        const [lo, hi] = RANGES[k];
        knobs[k] = +(lo + (hi - lo) * reflect(x[i])).toPrecision(4);
    });
    if (knobs.GUN_RELEASE_HEAT! >= knobs.GUN_BACKOFF_HEAT!) knobs.GUN_RELEASE_HEAT = knobs.GUN_BACKOFF_HEAT! - 5;
    return knobs;
}

const defaults = KNOBS.map((k) => {
    const [lo, hi] = RANGES[k];
    return (REFERENCE_KNOB_DEFAULTS[k] - lo) / (hi - lo);
});

/** One run's scalar fitness: the pass dominates; hold time, station damage and kills break ties. */
function runFitness(r: WaveRun, timeoutSeconds: number) {
    const passed = r.stationsLost === 0 && (r.survived ?? 0) >= 3 ? 1 : 0;
    const f = r.fitness;
    return (
        passed +
        (0.5 * Math.min(f.holdSeconds, timeoutSeconds)) / timeoutSeconds -
        (0.25 * f.stationArmorLost) / 3 -
        (0.25 * f.stationCapsuleLost) / 3 +
        0.01 * f.raidersKilled
    );
}

type State = {
    generation: number;
    mean: number[];
    sigma: number;
    path: number[];
    rngState: number;
    history: {
        generation: number;
        firstSeed: number;
        sigma: number;
        defaultFitness: number;
        defaultPasses: number;
        meanFitness: number;
        meanPasses: number;
        bestFitness: number;
        bestPasses: number;
        bestKnobs: Partial<ReferenceKnobs>;
    }[];
};

function gaussian(state: State) {
    const next = () => {
        state.rngState = (state.rngState * 1103515245 + 12345) % 2147483648;
        return (state.rngState + 0.5) / 2147483648;
    };
    return Math.sqrt(-2 * Math.log(next())) * Math.cos(2 * Math.PI * next());
}

/** Training workers other lanes hold on this host (their `--workers`), read from the process table. */
function othersWorkers(outDir: string) {
    try {
        return execSync("pgrep -fl '^npm run (waves|train)' || true", { encoding: 'utf8' })
            .split('\n')
            .filter((l) => l && !l.includes(outDir))
            .reduce((sum, l) => sum + Number(/--workers (\d+)/.exec(l)?.[1] ?? 1), 0);
    } catch {
        return 0;
    }
}

function hostPressured() {
    try {
        const free = Number(/(\d+)%/.exec(execSync('memory_pressure | tail -1', { encoding: 'utf8' }))?.[1] ?? 100);
        const load5 = Number(execSync('sysctl -n vm.loadavg', { encoding: 'utf8' }).split(' ')[2]);
        return free < 30 || load5 > 13;
    } catch {
        return false;
    }
}

function playGeneration(dir: string, crews: string[], firstSeed: number, seeds: number, timeout: number, workers: number) {
    fs.mkdirSync(dir, { recursive: true });
    return new Promise<WaveRun[]>((resolve, reject) => {
        // through npm, so other lanes counting `npm run waves` processes see this generation's workers
        const child = spawn(
            'npm',
            [
                'run',
                'waves',
                '--',
                '--scenario', 'W-waves',
                ...crews.flatMap((c) => ['--crew', c]),
                '--seeds', String(seeds),
                '--first-seed', String(firstSeed),
                '--timeout', String(timeout),
                '--workers', String(workers),
                '--out', dir,
            ],
            { cwd: path.join(__dirname, '../..'), stdio: ['ignore', fs.openSync(path.join(dir, 'waves.log'), 'w'), fs.openSync(path.join(dir, 'waves.err'), 'w')] },
        );
        child.once('exit', (code) =>
            code === 0
                ? resolve(JSON.parse(fs.readFileSync(path.join(dir, 'W-waves-waves.json'), 'utf8')) as WaveRun[])
                : reject(new Error(`waves exit ${code} in ${dir}`)),
        );
    });
}

/** Deletes a generation's recordings: runs are deterministic, the genome and seeds reproduce them. */
function sweep(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) fs.rmSync(path.join(dir, entry.name), { recursive: true, force: true });
    }
}

async function main() {
    const outDir = path.resolve(arg('out', 'search-out'));
    const base = JSON.parse(fs.readFileSync(path.resolve(arg('base', 'crews/captain-reference-guard.json')), 'utf8')) as {
        name: string;
        seats: { brain?: string }[];
    };
    const baseDir = path.dirname(path.resolve(arg('base', 'crews/captain-reference-guard.json')));
    const lambda = Number(arg('lambda', '8'));
    const seeds = Number(arg('seeds', '16'));
    const [poolLo, poolHi] = arg('seed-pool', '101-164').split('-').map(Number);
    const timeout = Number(arg('timeout', '1500'));
    const maxWorkers = Number(arg('max-workers', '12'));
    const generations = Number(arg('generations', '1000'));

    const mu = Math.floor(lambda / 2);
    const rawW = Array.from({ length: mu }, (_, i) => Math.log(mu + 0.5) - Math.log(i + 1));
    const wSum = rawW.reduce((a, b) => a + b, 0);
    const w = rawW.map((x) => x / wSum);
    const muEff = 1 / w.reduce((a, b) => a + b * b, 0);
    const cs = (muEff + 2) / (N + muEff + 5);
    const ds = 1 + 2 * Math.max(0, Math.sqrt((muEff - 1) / (N + 1)) - 1) + cs;
    const chiN = Math.sqrt(N) * (1 - 1 / (4 * N) + 1 / (21 * N * N));

    fs.mkdirSync(outDir, { recursive: true });
    const statePath = path.join(outDir, 'state.json');
    const state: State = fs.existsSync(statePath)
        ? (JSON.parse(fs.readFileSync(statePath, 'utf8')) as State)
        : { generation: 0, mean: [...defaults], sigma: 0.15, path: Array<number>(N).fill(0), rngState: 20261022, history: [] };

    const writeCrew = (dir: string, name: string, knobs: Partial<ReferenceKnobs>) => {
        const file = path.join(dir, `${name}.json`);
        const seats = base.seats.map((s) => (s.brain ? { ...s, brain: path.resolve(baseDir, s.brain) } : s));
        fs.writeFileSync(file, JSON.stringify({ ...base, name, seats, knobs }, null, 1));
        return file;
    };

    while (state.generation < generations) {
        const g = state.generation;
        const poolSize = poolHi - poolLo + 1;
        const firstSeed = poolLo + ((g * seeds) % poolSize);
        const dir = path.join(outDir, `gen${String(g).padStart(4, '0')}`);
        fs.mkdirSync(dir, { recursive: true });
        const zs = Array.from({ length: lambda }, () => Array.from({ length: N }, () => gaussian(state)));
        const xs = zs.map((z) => z.map((zi, i) => state.mean[i] + state.sigma * zi));
        const crews = [
            writeCrew(dir, 'default', {}),
            writeCrew(dir, 'mean', knobsOf(state.mean)),
            ...xs.map((x, i) => writeCrew(dir, `c${i}`, knobsOf(x))),
        ];
        // the host's training workers stay within --max-workers across lanes: wait for a free one
        let workers = Math.min(seeds, maxWorkers - othersWorkers(outDir));
        while (workers < 1 || hostPressured()) {
            await new Promise((r) => setTimeout(r, 60_000));
            workers = Math.min(seeds, maxWorkers - othersWorkers(outDir));
        }
        const started = Date.now();
        const runs = await playGeneration(dir, crews, Math.min(firstSeed, poolHi - seeds + 1), seeds, timeout, workers);
        sweep(dir);
        const score = (crew: string) => {
            const mine = runs.filter((r) => r.crew === crew);
            return {
                fitness: mine.reduce((a, r) => a + runFitness(r, timeout), 0) / mine.length,
                passes: mine.filter((r) => r.stationsLost === 0 && (r.survived ?? 0) >= 3).length,
            };
        };
        const ranked = xs.map((x, i) => ({ x, z: zs[i], ...score(`c${i}`) })).sort((a, b) => b.fitness - a.fitness);
        const zMean = Array.from({ length: N }, (_, i) => ranked.slice(0, mu).reduce((a, r, k) => a + w[k] * r.z[i], 0));
        state.mean = state.mean.map((m, i) => reflect(m + state.sigma * zMean[i]));
        state.path = state.path.map((p, i) => (1 - cs) * p + Math.sqrt(cs * (2 - cs) * muEff) * zMean[i]);
        const pathNorm = Math.sqrt(state.path.reduce((a, p) => a + p * p, 0));
        state.sigma = Math.min(0.5, Math.max(0.01, state.sigma * Math.exp((cs / ds) * (pathNorm / chiN - 1))));
        const d = score('default');
        const m = score('mean');
        state.history.push({
            generation: g,
            firstSeed,
            sigma: state.sigma,
            defaultFitness: d.fitness,
            defaultPasses: d.passes,
            meanFitness: m.fitness,
            meanPasses: m.passes,
            bestFitness: ranked[0].fitness,
            bestPasses: ranked[0].passes,
            bestKnobs: knobsOf(ranked[0].x),
        });
        state.generation = g + 1;
        fs.writeFileSync(statePath + '.tmp', JSON.stringify(state, null, 1));
        fs.renameSync(statePath + '.tmp', statePath);
        fs.writeFileSync(path.join(outDir, 'mean-knobs.json'), JSON.stringify(knobsOf(state.mean), null, 1));
        process.stdout.write(
            `gen ${g} seeds ${firstSeed}+${seeds} workers ${workers} wall ${((Date.now() - started) / 1000).toFixed(0)} s: ` +
                `default ${d.fitness.toFixed(3)} (${d.passes}) mean ${m.fitness.toFixed(3)} (${m.passes}) ` +
                `best ${ranked[0].fitness.toFixed(3)} (${ranked[0].passes}) sigma ${state.sigma.toFixed(3)}\n`,
        );
    }
}

if (require.main === module) void main();
