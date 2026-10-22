/**
 * Searches the reference crew's numeric knobs (`REFERENCE_KNOB_DEFAULTS` in `@starwards/bots`) for
 * a better wave defence: a (μ/μ_w, λ)-ES with cumulative step-size adaptation over the knobs scaled
 * to [0, 1] within their ranges. Each generation plays the defaults, the current mean and λ samples
 * on the same window of the tuning seed bank through `waves` (W-waves and the intercept and lof cuts), scored by the composite fitness against the defaults, so every candidate is paired with the
 * defaults. State is checkpointed to `<out>/state.json` after each generation; rerunning with the
 * same `--out` resumes.
 *
 *   npm --prefix modules/ai run search -- --out <dir> [--base crews/captain-reference-guard.json] [--lambda 8]
 *       [--seeds 16] [--timeout 1500] [--max-workers 12] [--generations 1000] [--fitness lexicographic|composite]
 *       [--promote 3]
 *
 * `--fitness lexicographic` (default) ranks by W-waves passes, then time to the first station loss on
 * failed runs, then wave-3 station damage (`lexicographic-fitness.ts`); `composite` by the paired
 * composite with the pass non-inferiority penalty. `--promote k` replays a generation's top k
 * candidates on the whole tuning bank and keeps the best by lexicographic fitness as `champion` in
 * the state (and `champion-knobs.json`); the defaults' tuning-bank fitness is played once and kept.
 */
import { REFERENCE_KNOB_DEFAULTS, ReferenceKnobs } from '@starwards/bots';

import { CompositeWeights, compositeCompare } from '../scoring/composite-fitness';
import { LexicographicFitness, compareLexicographic, lexicographicFitness } from '../scoring/lexicographic-fitness';
import { TUNING_SEEDS } from '../training/seed-banks';
import { WaveRun } from '../training/wave-compare';

/** Scenarios each generation plays, with their timeouts; W-waves takes `--timeout`. */
const SCENARIOS: [string, number][] = [
    ['W-waves', 1500],
    ['W-cut-intercept', 480],
    ['W-cut-lof', 480],
];
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
    FIRE_RANGE_METERS: [1500, 8000],
    STATION_GUARD_METERS: [0, 6000],
    WAVE_SHELL_BUDGET: [0.2, 1],
    SHELL_BUDGET_SECONDS: [300, 900],
    FINISH_LOCK_SECONDS: [0, 20],
    FRAG_FIRST_SECONDS: [0, 900],
};
const ALL_KNOBS = Object.keys(RANGES) as Knob[];
/** Knobs held at their defaults: `--freeze A,B`. */
const FROZEN = new Set(arg('freeze', '').split(',').filter(Boolean));
for (const k of FROZEN) if (!(k in RANGES)) throw new Error(`unknown knob ${k}`);
const KNOBS = ALL_KNOBS.filter((k) => !FROZEN.has(k));
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

/** Position in [0, 1] of a knob value in its range. */
const unit = (k: Knob, v: number) => (v - RANGES[k][0]) / (RANGES[k][1] - RANGES[k][0]);

const defaults = KNOBS.map((k) => unit(k, REFERENCE_KNOB_DEFAULTS[k]));

type State = {
    generation: number;
    /** The searched knobs, in the order of `mean`, `path` and `scales`. */
    knobs?: Knob[];
    mean: number[];
    sigma: number;
    /** Per-knob step multipliers on `sigma`: a knob added on a warm restart gets its own fresh step. */
    scales?: number[];
    path: number[];
    rngState: number;
    /** The defaults' lexicographic fitness on the whole tuning bank (`--promote`). */
    defaultOnBank?: LexicographicFitness;
    /** Best promoted candidate on the whole tuning bank. */
    champion?: { generation: number; knobs: Partial<ReferenceKnobs>; fitness: LexicographicFitness };
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
        /** Tuning-bank fitness of the promoted candidates (`--promote`). */
        promoted?: { knobs: Partial<ReferenceKnobs>; fitness: LexicographicFitness }[];
        /** Lexicographic fitness of the defaults, the mean and the best candidate. */
        lexicographic?: Record<'default' | 'mean' | 'best', LexicographicFitness>;
        /** Mean HE and AP shells drawn in wave 2 per W-waves run, by crew (diagnostic only). */
        wave2Shells?: Record<string, number>;
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

function playGeneration(
    dir: string,
    scenario: string,
    crews: string[],
    firstSeed: number,
    seeds: number,
    timeout: number,
    workers: number,
) {
    fs.mkdirSync(dir, { recursive: true });
    return new Promise<WaveRun[]>((resolve, reject) => {
        // through npm, so other lanes counting `npm run waves` processes see this generation's workers
        const child = spawn(
            'npm',
            [
                'run',
                'waves',
                '--',
                '--scenario',
                scenario,
                ...crews.flatMap((c) => ['--crew', c]),
                '--seeds',
                String(seeds),
                '--first-seed',
                String(firstSeed),
                '--timeout',
                String(timeout),
                '--workers',
                String(workers),
                '--out',
                dir,
            ],
            {
                cwd: path.join(__dirname, '../..'),
                stdio: [
                    'ignore',
                    fs.openSync(path.join(dir, 'waves.log'), 'w'),
                    fs.openSync(path.join(dir, 'waves.err'), 'w'),
                ],
            },
        );
        child.once('exit', (code) =>
            code === 0
                ? resolve(JSON.parse(fs.readFileSync(path.join(dir, `${scenario}-waves.json`), 'utf8')) as WaveRun[])
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

/**
 * A fresh state: at the defaults, or warm from another search's state (its knobs keep their mean and
 * step; knobs it did not search start at the default with step `newSigma`), with `seedKnobs` (a knob
 * preset file) overriding the mean.
 */
function startState(warmPath: string, seedKnobsPath: string, newSigma: number): State {
    const mean = [...defaults];
    let sigma = newSigma;
    let scales = Array<number>(N).fill(1);
    let generation = 0;
    let rngState = 20261022;
    const history: State['history'] = [];
    if (warmPath) {
        const warm = JSON.parse(fs.readFileSync(warmPath, 'utf8')) as State;
        // a state without names searched the first knobs of RANGES, in order
        const names = warm.knobs ?? ALL_KNOBS.slice(0, warm.mean.length);
        sigma = warm.sigma;
        scales = KNOBS.map((k, i) => {
            const j = names.indexOf(k);
            if (j < 0) return newSigma / sigma;
            mean[i] = warm.mean[j];
            return warm.scales?.[j] ?? 1;
        });
        generation = warm.generation;
        rngState = warm.rngState;
        history.push(...warm.history);
    }
    if (seedKnobsPath) {
        const seed = JSON.parse(fs.readFileSync(seedKnobsPath, 'utf8')) as Partial<ReferenceKnobs>;
        for (const [k, v] of Object.entries(seed)) {
            const i = KNOBS.indexOf(k as Knob);
            if (i >= 0) mean[i] = unit(k as Knob, v);
        }
    }
    return { generation, knobs: KNOBS, mean, sigma, scales, path: Array<number>(N).fill(0), rngState, history };
}

async function main() {
    const outDir = path.resolve(arg('out', 'search-out'));
    const base = JSON.parse(
        fs.readFileSync(path.resolve(arg('base', 'crews/captain-reference-guard.json')), 'utf8'),
    ) as {
        name: string;
        seats: { brain?: string }[];
    };
    const baseDir = path.dirname(path.resolve(arg('base', 'crews/captain-reference-guard.json')));
    const lambda = Number(arg('lambda', '8'));
    const seeds = Number(arg('seeds', '16'));
    // tuning bank only: the held-out bank (HELD_OUT_SEEDS) is never played here
    const poolLo = TUNING_SEEDS.first;
    const poolHi = TUNING_SEEDS.first + TUNING_SEEDS.count - 1;
    const weights = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../scoring/models/composite-weights.json'), 'utf8'),
    ) as CompositeWeights;
    const timeout = Number(arg('timeout', '1500'));
    const maxWorkers = Number(arg('max-workers', '12'));
    const generations = Number(arg('generations', '1000'));
    const fitnessKind = arg('fitness', 'lexicographic');
    const promote = Number(arg('promote', '0'));
    if (fitnessKind !== 'lexicographic' && fitnessKind !== 'composite') throw new Error(`unknown --fitness ${fitnessKind}`);

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
        : startState(arg('warm', ''), arg('seed-knobs', ''), Number(arg('new-sigma', '0.15')));
    if (state.knobs && state.knobs.join() !== KNOBS.join()) {
        throw new Error(`state searches ${state.knobs.join()}, not ${KNOBS.join()}`);
    }
    const scales = state.scales ?? Array<number>(N).fill(1);

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
        const xs = zs.map((z) => z.map((zi, i) => state.mean[i] + state.sigma * scales[i] * zi));
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
        const runs: Record<string, WaveRun[]> = {};
        // the lexicographic fitness reads W-waves only
        for (const [scenario, scenarioTimeout] of fitnessKind === 'lexicographic' ? SCENARIOS.slice(0, 1) : SCENARIOS) {
            const scenarioDir = path.join(dir, scenario);
            runs[scenario] = await playGeneration(
                scenarioDir,
                scenario,
                crews,
                firstSeed,
                seeds,
                scenario === 'W-waves' ? timeout : scenarioTimeout,
                workers,
            );
            sweep(scenarioDir);
        }
        const isPass = (r: WaveRun) => r.stationsLost === 0 && (r.survived ?? 0) >= 3;
        const passesOf = (crew: string) => runs['W-waves'].filter((r) => r.crew === crew && isPass(r)).length;
        /** Composite against the defaults in noise units, minus 1 when W-waves passes fall beyond non-inferiority. */
        const lex = (crew: string) => lexicographicFitness(runs['W-waves'], crew);
        const score = (crew: string) => {
            if (fitnessKind === 'lexicographic') return { fitness: passesOf(crew), passes: passesOf(crew) };
            if (crew === 'default') return { fitness: 0, passes: passesOf(crew) };
            const composite = compositeCompare(weights, runs, 'default', crew).composite.estimate;
            const base = new Map(runs['W-waves'].filter((r) => r.crew === 'default').map((r) => [r.seed, isPass(r)]));
            const lost = runs['W-waves'].filter((r) => r.crew === crew && base.get(r.seed) && !isPass(r)).length;
            return { fitness: composite - (lost > Math.floor((2 * seeds) / 64) ? 1 : 0), passes: passesOf(crew) };
        };
        const ranked = xs
            .map((x, i) => ({ x, z: zs[i], lex: lex(`c${i}`), ...score(`c${i}`) }))
            .sort((a, b) =>
                fitnessKind === 'lexicographic' ? compareLexicographic(a.lex, b.lex) : b.fitness - a.fitness,
            );
        const zMean = Array.from({ length: N }, (_, i) =>
            ranked.slice(0, mu).reduce((a, r, k) => a + w[k] * r.z[i], 0),
        );
        state.mean = state.mean.map((m, i) => reflect(m + state.sigma * scales[i] * zMean[i]));
        state.path = state.path.map((p, i) => (1 - cs) * p + Math.sqrt(cs * (2 - cs) * muEff) * zMean[i]);
        const pathNorm = Math.sqrt(state.path.reduce((a, p) => a + p * p, 0));
        state.sigma = Math.min(0.5, Math.max(0.01, state.sigma * Math.exp((cs / ds) * (pathNorm / chiN - 1))));
        const wave2Shells = Object.fromEntries(
            ['default', 'mean', ...xs.map((_, i) => `c${i}`)].map((crew) => {
                const rows = runs['W-waves'].filter((r) => r.crew === crew);
                const shells = rows.map(
                    (r) => (r.ammo?.fired[2]?.HiExpShell ?? 0) + (r.ammo?.fired[2]?.ArmPenShell ?? 0),
                );
                return [crew, +(shells.reduce((a, b) => a + b, 0) / Math.max(1, rows.length)).toFixed(1)];
            }),
        );
        let promoted: { knobs: Partial<ReferenceKnobs>; fitness: LexicographicFitness }[] | undefined;
        if (promote > 0) {
            const top = ranked.slice(0, promote).map((r, i) => ({ name: `p${i}`, knobs: knobsOf(r.x) }));
            const bankCrews = [
                ...(state.defaultOnBank ? [] : [writeCrew(dir, 'default', {})]),
                ...top.map((t) => writeCrew(dir, t.name, t.knobs)),
            ];
            const bankDir = path.join(dir, 'W-waves-bank');
            const bank = await playGeneration(
                bankDir,
                'W-waves',
                bankCrews,
                poolLo,
                poolSize,
                timeout,
                Math.min(poolSize, Math.max(1, maxWorkers - othersWorkers(outDir))),
            );
            sweep(bankDir);
            state.defaultOnBank ??= lexicographicFitness(bank, 'default');
            promoted = top.map((t) => ({ knobs: t.knobs, fitness: lexicographicFitness(bank, t.name) }));
            for (const p of promoted) {
                if (!state.champion || compareLexicographic(p.fitness, state.champion.fitness) < 0) {
                    state.champion = { generation: g, ...p };
                }
            }
            fs.writeFileSync(path.join(outDir, 'champion-knobs.json'), JSON.stringify(state.champion!.knobs, null, 1));
        }
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
            promoted,
            lexicographic: { default: lex('default'), mean: lex('mean'), best: ranked[0].lex },
            wave2Shells,
        });
        state.generation = g + 1;
        fs.writeFileSync(statePath + '.tmp', JSON.stringify(state, null, 1));
        fs.renameSync(statePath + '.tmp', statePath);
        fs.writeFileSync(path.join(outDir, 'mean-knobs.json'), JSON.stringify(knobsOf(state.mean), null, 1));
        const fmt = (f: LexicographicFitness) =>
            `${f.passes}/${f.failHoldSeconds.toFixed(0)}s/${f.wave3StationDamage.toFixed(0)}`;
        process.stdout.write(
            `gen ${g} lex default ${fmt(lex('default'))} mean ${fmt(lex('mean'))} best ${fmt(ranked[0].lex)} | ` +
                `seeds ${firstSeed}+${seeds} workers ${workers} wall ${((Date.now() - started) / 1000).toFixed(0)} s: ` +
                `default ${d.fitness.toFixed(3)} (${d.passes}) mean ${m.fitness.toFixed(3)} (${m.passes}) ` +
                `best ${ranked[0].fitness.toFixed(3)} (${ranked[0].passes}) sigma ${state.sigma.toFixed(3)} ` +
                `wave-2 HE+AP default ${wave2Shells.default} mean ${wave2Shells.mean}` +
                (promoted
                    ? ` | bank default ${fmt(state.defaultOnBank!)} promoted ${promoted.map((p) => fmt(p.fitness)).join(' ')} champion ${fmt(state.champion!.fitness)}`
                    : '') +
                '\n',
        );
    }
}

if (require.main === module) void main();
