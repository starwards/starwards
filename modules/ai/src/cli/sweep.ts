/**
 * Branch-from-state sweep: records a crew's run per seed, then at fixed fork times plays each of the
 * captain's strategic and tactical alternatives (up to `--k` per state), `--rollouts` times with the
 * fork time jittered by `--jitter` seconds per rollout, to the timeout. The recorded run is the default
 * action. Writes `sweep.jsonl` (one row per rollout) and `sweep.md` (per state: each action's pass rate
 * with a bootstrap interval, and its mean time to the first station lost).
 *
 *   npm run sweep -- --crew <crew.json> --scenario W-waves --seeds 66,70 --times 600,630 [--k 8]
 *       [--oracle cap,cap+he] [--alts close_to,hold_here] [--states 66@600,70@630] [--rollouts 8] [--jitter 2] [--timeout 1500] [--workers 4] --out <dir>
 *
 * Rollouts stream to `sweep.jsonl`; a rerun into the same `--out` plays only the missing ones, and
 * `--summary-only` summarizes what is there without playing more.
 *
 * The harness is deterministic, so rollout spread comes from the jitter alone: it measures how much an
 * action's outcome depends on exactly when it is taken.
 */
import {
    Alternative,
    BranchPoint,
    DecisionLevel,
    Intervention,
    strategicLevel,
    tacticalLevel,
} from '../branching/levels';
import { ShipState } from '@starwards/core/internal';
import { TRAINING_PLAYER_ID } from '@starwards/server/src/scenarios/training';
import { RunSpec, runBranch } from '../branching/fork';
import { readRunLog, stateAt } from '../branching/run-log';

import { fork as forkProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function arg(name: string, fallback?: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

/** Alternative kinds in the order a state's `k` candidates are taken. */
const KIND_ORDER = [
    'engage_other',
    'close_to',
    'hold_here',
    'chase_target',
    'retreat',
    'hold_position',
    'dock_for_repair',
    'engage',
];

type Job =
    | { kind: 'record'; run: RunSpec; dir: string }
    | { kind: 'branch'; run: RunSpec; recording: string; level: string; t: number; fork: number; alternative: string };

type Row = {
    seed: number;
    t: number;
    fork: number;
    alternative: string;
    pass: boolean;
    firstStationLostAt: number | null;
    seconds: number;
};

function pointAt(level: DecisionLevel, log: ReturnType<typeof readRunLog>, t: number): BranchPoint {
    return { level: level.name as BranchPoint['level'], t, reasons: ['sweep'], taken: 'keep', state: stateAt(log, t) };
}

/** The `k` alternatives a state is swept over, strategic and tactical, in `KIND_ORDER`. */
export function candidates(log: ReturnType<typeof readRunLog>, t: number, k: number, only?: readonly string[]) {
    const all: { level: DecisionLevel; alt: Alternative }[] = [];
    for (const level of [tacticalLevel(), strategicLevel]) {
        for (const alt of level.alternatives(pointAt(level, log, t), log)) all.push({ level, alt });
    }
    const rank = (kind: string) => {
        const i = KIND_ORDER.indexOf(kind);
        return i < 0 ? KIND_ORDER.length : i;
    };
    const seen = new Set<string>();
    return all
        .sort((a, b) => rank(a.alt.kind) - rank(b.alt.kind))
        .filter(({ alt }) => !only || only.some((o) => alt.id === o || alt.id.startsWith(`${o}@`)))
        .filter(({ alt }) => (seen.has(alt.kind) ? false : (seen.add(alt.kind), true)))
        .slice(0, k)
        .map(({ level, alt }) => ({ level: level.name, alternative: alt.id }));
}

const pass = (w: { stationsLost: number; survived: number } | undefined) =>
    !!w && w.stationsLost === 0 && w.survived >= 3;

/**
 * Test-only oracles a sweep can fork into (`--oracle`): at the fork, once, the GVTS's magazine
 * capacity is restored (`cap`), and also its HE missiles restocked to the restored max (`cap+he`).
 */
const ORACLES: Record<string, (fork: number) => Intervention> = {
    cap: (fork) => once(fork, (state) => void (state.magazine.capacity = 1)),
    'cap+he': (fork) =>
        once(fork, (state) => {
            state.magazine.capacity = 1;
            (state.magazine as unknown as Record<string, number>).count_HiExpMissile =
                state.magazine.getMax('HiExpMissile');
        }),
};

function once(fork: number, act: (state: ShipState) => void): Intervention {
    let done = false;
    return {
        script: (game) => {
            if (done || game.seconds + 1e-9 < fork) return;
            const state = game.shipManagers.get(TRAINING_PLAYER_ID)?.state;
            if (!state) return;
            act(state);
            done = true;
        },
    };
}

/** The run log of the last recording this worker read: one only, as each is ~10 MB. */
let lastLog: { recording: string; log: ReturnType<typeof readRunLog> } | undefined;

async function play(job: Job): Promise<unknown> {
    if (job.kind === 'record') {
        fs.mkdirSync(job.dir, { recursive: true });
        const o = await runBranch(job.run, 0, undefined, job.dir);
        return { seed: job.run.seed, pass: pass(o.waves), firstStationLostAt: o.waves?.firstStationLostAt ?? null };
    }
    if (job.alternative.startsWith('oracle:')) {
        const o = await runBranch(job.run, job.fork, ORACLES[job.alternative.slice(7)](job.fork));
        return {
            seed: job.run.seed,
            t: job.t,
            fork: job.fork,
            alternative: job.alternative,
            pass: pass(o.waves),
            firstStationLostAt: o.waves?.firstStationLostAt ?? null,
            seconds: o.seconds,
        } satisfies Row;
    }
    if (lastLog?.recording !== job.recording) lastLog = { recording: job.recording, log: readRunLog(job.recording) };
    const log = lastLog.log;
    const level = job.level === 'strategic' ? strategicLevel : tacticalLevel();
    const alt = level.alternatives(pointAt(level, log, job.fork), log).find((a) => a.id === job.alternative);
    if (!alt) return null;
    const o = await runBranch(job.run, job.fork, alt.intervention);
    const row: Row = {
        seed: job.run.seed,
        t: job.t,
        fork: job.fork,
        alternative: job.alternative,
        pass: pass(o.waves),
        firstStationLostAt: o.waves?.firstStationLostAt ?? null,
        seconds: o.seconds,
    };
    process.stderr.write(`seed ${row.seed} t=${job.fork} ${job.alternative}: ${row.pass ? 'pass' : 'fail'}\n`);
    return row;
}

async function pool(jobs: readonly Job[], workers: number, onResult?: (r: unknown) => void) {
    const queue = [...jobs];
    const results: unknown[] = [];
    await Promise.all(
        Array.from(
            { length: Math.min(workers, jobs.length) },
            () =>
                new Promise<void>((resolve, reject) => {
                    const child = forkProcess(__filename, [], { execArgv: process.execArgv });
                    const next = () => {
                        const job = queue.shift();
                        if (job) child.send(job);
                        else child.disconnect();
                    };
                    child.on('message', (r) => {
                        results.push(r);
                        onResult?.(r);
                        next();
                    });
                    child.once('error', reject);
                    child.once('exit', (code) => (code ? reject(new Error(`worker exit ${code}`)) : resolve()));
                    next();
                }),
        ),
    );
    return results;
}

/** 95% percentile bootstrap interval of the mean of `xs`. */
export function bootstrap(xs: readonly number[], draws = 2000, rng = mulberry(1)): [number, number] {
    if (!xs.length) return [NaN, NaN];
    const means = Array.from({ length: draws }, () => {
        let s = 0;
        for (let i = 0; i < xs.length; i++) s += xs[Math.floor(rng() * xs.length)];
        return s / xs.length;
    }).sort((a, b) => a - b);
    return [means[Math.floor(0.025 * draws)], means[Math.ceil(0.975 * draws) - 1]];
}

function mulberry(seed: number) {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Per state: each action's pass rate and interval, and whether the best action's interval clears the
 * default's (recorded) outcome on pass, or on time to the first station lost (timeout when none).
 */
export function summarize(
    rows: readonly Row[],
    defaults: ReadonlyMap<number, { pass: boolean; firstStationLostAt: number | null }>,
    timeout: number,
) {
    const lost = (x: number | null) => x ?? timeout;
    const states = new Map<string, Row[]>();
    for (const r of rows) {
        const key = `${r.seed}@${r.t}`;
        states.set(key, [...(states.get(key) ?? []), r]);
    }
    const out = [];
    for (const [key, list] of states) {
        const [seed, t] = key.split('@').map(Number);
        const d = defaults.get(seed)!;
        const byAlt = new Map<string, Row[]>();
        for (const r of list) byAlt.set(r.alternative, [...(byAlt.get(r.alternative) ?? []), r]);
        const actions = [...byAlt].map(([alternative, rs]) => {
            const passes = rs.map((r): number => (r.pass ? 1 : 0));
            const losses = rs.map((r) => lost(r.firstStationLostAt));
            return {
                alternative,
                n: rs.length,
                passRate: passes.reduce((a, b) => a + b, 0) / rs.length,
                passCi: bootstrap(passes),
                meanLost: losses.reduce((a, b) => a + b, 0) / rs.length,
                lostCi: bootstrap(losses),
            };
        });
        const best = [...actions].sort((a, b) => b.passRate - a.passRate || b.meanLost - a.meanLost)[0];
        const bestLost = [...actions].sort((a, b) => b.meanLost - a.meanLost)[0];
        out.push({
            seed,
            t,
            defaultPass: d.pass,
            defaultLost: lost(d.firstStationLostAt),
            actions,
            best: best?.alternative,
            decisivePass: !!best && best.passCi[0] > Number(d.pass),
            decisiveLost: !!bestLost && bestLost.lostCi[0] > lost(d.firstStationLostAt),
            bestLost: bestLost?.alternative,
        });
    }
    return out.sort((a, b) => a.seed - b.seed || a.t - b.t);
}

async function main() {
    const crew = path.resolve(arg('crew')!);
    const scenario = arg('scenario', 'W-waves')!;
    const seeds = arg('seeds')!.split(',').map(Number);
    const times = arg('times', '600,630,660,690')!.split(',').map(Number);
    const k = Number(arg('k', '8'));
    const only = arg('alts')?.split(',');
    // `--states seed@t,...` sweeps only those states, e.g. to add rollouts where the interval straddles
    const pick = arg('states')?.split(',');
    const rollouts = Number(arg('rollouts', '8'));
    const jitter = Number(arg('jitter', '2'));
    const timeoutSeconds = Number(arg('timeout', '1500'));
    const workers = Number(arg('workers', '4'));
    const out = path.resolve(arg('out')!);
    fs.mkdirSync(out, { recursive: true });

    const runOf = (seed: number): RunSpec => ({ crew, scenario, seed, timeoutSeconds });
    const recDir = (seed: number) => path.join(out, 'runs', `seed${seed}`);
    const defaultsFile = path.join(out, 'defaults.json');
    const recorded = (
        fs.existsSync(defaultsFile)
            ? JSON.parse(fs.readFileSync(defaultsFile, 'utf8'))
            : await pool(
                  seeds.map((seed) => ({ kind: 'record' as const, run: runOf(seed), dir: recDir(seed) })),
                  workers,
              )
    ) as { seed: number; pass: boolean; firstStationLostAt: number | null }[];
    const defaults = new Map(recorded.map((r) => [r.seed, r]));
    fs.writeFileSync(defaultsFile, JSON.stringify(recorded, null, 1));

    const jobs: Job[] = [];
    for (const seed of seeds) {
        const recording = fs
            .readdirSync(recDir(seed), { recursive: true, encoding: 'utf8' })
            .find((f) => f.endsWith('.sgr'));
        if (!recording) throw new Error(`no recording for seed ${seed} in ${recDir(seed)}`);
        const full = path.join(recDir(seed), recording);
        const log = readRunLog(full);
        for (const t of times) {
            if (pick && !pick.includes(`${seed}@${t}`)) continue;
            const oracles = arg('oracle')?.split(',');
            const chosen = oracles
                ? oracles.map((o) => ({ level: 'oracle', alternative: `oracle:${o}` }))
                : candidates(log, t, k, only);
            for (const c of chosen) {
                for (let j = 0; j < rollouts; j++) {
                    jobs.push({
                        kind: 'branch',
                        run: runOf(seed),
                        recording: full,
                        level: c.level,
                        t,
                        fork: t + j * jitter,
                        alternative: c.alternative,
                    });
                }
            }
        }
    }
    // rows stream to sweep.jsonl as they finish; a rerun into the same --out skips the rollouts already there
    const jsonl = path.join(out, 'sweep.jsonl');
    const key = (r: { seed: number; fork: number; alternative: string }) => `${r.seed}@${r.fork}@${r.alternative}`;
    const done: Row[] = fs.existsSync(jsonl)
        ? fs
              .readFileSync(jsonl, 'utf8')
              .split('\n')
              .filter(Boolean)
              .map((l) => JSON.parse(l) as Row)
        : [];
    const have = new Set(done.map(key));
    const todo = jobs.filter((j) => j.kind !== 'branch' || !have.has(key({ seed: j.run.seed, ...j })));
    process.stderr.write(`${jobs.length} branches, ${todo.length} to play\n`);
    const played = (
        (await pool(
            process.argv.includes('--summary-only') ? [] : todo,
            workers,
            (r) => r && fs.appendFileSync(jsonl, JSON.stringify(r) + '\n'),
        )) as (Row | null)[]
    ).filter((r): r is Row => r !== null);
    const rows = [...done, ...played];
    const states = summarize(rows, defaults, timeoutSeconds);
    fs.writeFileSync(path.join(out, 'sweep.json'), JSON.stringify(states, null, 1));
    const f = (x: number) => x.toFixed(2);
    const lines = [
        `# Branch sweep: ${path.basename(crew)}, seeds ${seeds.join(',')}, times ${times.join(',')}, ${rollouts} rollouts, jitter ${jitter} s`,
        '',
        `decisive on pass: ${states.filter((s) => s.decisivePass).length}/${states.length}; decisive on first station lost: ${states.filter((s) => s.decisiveLost).length}/${states.length}`,
        '',
        '| seed | t | default pass | default lost (s) | best | pass [CI] | best on lost | mean lost [CI] |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
        ...states.map((s) => {
            const b = s.actions.find((a) => a.alternative === s.best)!;
            const l = s.actions.find((a) => a.alternative === s.bestLost)!;
            return `| ${s.seed} | ${s.t} | ${s.defaultPass} | ${s.defaultLost.toFixed(0)} | ${s.best} | ${f(b.passRate)} [${f(b.passCi[0])}, ${f(b.passCi[1])}]${s.decisivePass ? ' *' : ''} | ${s.bestLost} | ${l.meanLost.toFixed(0)} [${l.lostCi[0].toFixed(0)}, ${l.lostCi[1].toFixed(0)}]${s.decisiveLost ? ' *' : ''} |`;
        }),
        '',
    ];
    fs.writeFileSync(path.join(out, 'sweep.md'), lines.join('\n'));
    process.stdout.write(lines.join('\n'));
}

if (process.send) {
    process.on('message', (job: Job) => {
        void play(job).then(
            (r) => process.send?.(r),
            (e: unknown) => {
                process.stderr.write(`${(e as Error).stack ?? String(e)}\n`);
                process.exit(1);
            },
        );
    });
} else {
    void main().catch((e: unknown) => {
        process.stderr.write(`${(e as Error).stack ?? String(e)}\n`);
        process.exit(1);
    });
}
