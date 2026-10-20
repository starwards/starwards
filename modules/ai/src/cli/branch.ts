/**
 * Counterfactual branching over recorded crew runs: replay a run from its seed, leave it at a decision
 * point, play an alternative decision, and compare the outcome with the recorded run.
 *
 *   npm --prefix modules/ai run branch -- points --recording <x.sgr> [--level strategic|tactical|button] [--station helms --control afterBurner]
 *   npm --prefix modules/ai run branch -- fork --recording <x.sgr> --crew <crew.json> --t <s> --level <level> --alt <id> [--timeout 400]
 *   npm --prefix modules/ai run branch -- prove --crew <crew.json> --scenario <rung> --seed <n> [--timeout 400] [--recording <x.sgr>]
 *   npm --prefix modules/ai run branch -- corpus --runs <train out dir> --crew <crew.json> --scenario <rung> [--levels strategic,tactical] [--budget 400] [--workers 4] [--window 30] --out <dir>
 *   npm --prefix modules/ai run branch -- corpus ... [--jev-proposals 3 --jev-cap-usd 10 --jev-ledger <spend.jsonl> --jev-index <decisions index> --jev-decisions <day ledger>]
 *   npm --prefix modules/ai run branch -- mine --corpus <dir>/branches.jsonl
 *   npm --prefix modules/ai run branch -- join-ledger --index <index.jsonl> [--ledger <decisions.jsonl>]... [--corpus <branches.jsonl>]...
 *
 * The scenario and seed of a recording come from its name (`<scenario>_seed<N>.sgr`). Seats must be
 * deterministic (reference, or Jev answered from the answer cache) for a replay to match its recording.
 */
import { BranchRow, CorpusRun, corpusTable, planCorpus, playJob } from '../branching/corpus';
import { DecisionLevel, buttonLevel, setTacticalWindow, strategicLevel, tacticalLevel } from '../branching/levels';
import {
    DecisionRow,
    appendRows,
    coverage,
    coveragePriority,
    joinPayouts,
    ledgerFromEnv,
    mergeIndex,
    readRows,
    writeRowsAtomic,
} from '../brain/decision-ledger';
import { Proposal, proposalKey, proposeAlternatives } from '../branching/jev-proposals';
import { RunLog, readRunLog } from '../branching/run-log';
import { answerCacheFromEnv, applyCacheFlags } from '../brain/jev-cache';
import { fingerprint, runBranch } from '../branching/fork';
import { loadBrainSpec, makeReferencePolicy, withOrderBoard } from '@starwards/bots';
import { mine, mineReport } from '../branching/mine';

import { CrewRunResult } from '../training/train-crew';
import { fork as forkProcess } from 'node:child_process';
import fs from 'node:fs';
import { jevClient } from '../brain/jev-client';
import path from 'node:path';
import { reask } from '../training/reask';

function arg(name: string, fallback?: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

function required(name: string) {
    const value = arg(name);
    if (value === undefined) throw new Error(`--${name} is required`);
    return value;
}

/** `<scenario>_seed<N>.sgr` → scenario and seed. */
function runOf(recording: string) {
    const m = /^(.+)_seed(\d+)\.sgr$/.exec(path.basename(recording));
    if (!m) throw new Error(`${recording}: expected <scenario>_seed<N>.sgr`);
    return { scenario: m[1], seed: Number(m[2]) };
}

type LevelOptions = {
    station?: string;
    control?: string;
    window?: number;
    captainBrain?: string;
    /** Button level: a brain file whose choice at each point (`reask`, reference policy) is an alternative. */
    reaskBrain?: string;
};

/** Button level: what `reaskBrain` (reference rules) would press at each recorded decision of the control. */
async function reaskChoices(log: RunLog, o: LevelOptions) {
    if (!o.reaskBrain || !o.station || !o.control) return undefined;
    const spec = loadBrainSpec(o.reaskBrain);
    const rows = await reask(
        spec,
        withOrderBoard(makeReferencePolicy(spec.decisionSeconds), spec.station),
        log.requests.filter((r) => r.station === o.station),
        log.decisions,
    );
    return new Map(rows.filter((r) => r.control.startsWith(o.control!)).map((r) => [r.t, r.after]));
}

function levelsFor(names: readonly string[], o: LevelOptions, asked?: Map<number, string>): DecisionLevel[] {
    if (o.window !== undefined) setTacticalWindow(o.window);
    return names.map((name) => {
        if (name === 'strategic') return strategicLevel;
        if (name === 'tactical') return tacticalLevel(o.captainBrain ? loadBrainSpec(o.captainBrain) : undefined);
        if (name === 'button') {
            if (!o.station || !o.control) throw new Error('the button level needs --station and --control');
            return buttonLevel(o.station, o.control, { reaskChoices: asked });
        }
        throw new Error(`unknown level ${name}: strategic, tactical or button`);
    });
}

const levelOptions = (): LevelOptions => ({
    station: arg('station'),
    control: arg('control'),
    window: arg('window') === undefined ? undefined : Number(arg('window')),
    captainBrain: arg('captain-brain') && path.resolve(arg('captain-brain')!),
    reaskBrain: arg('reask-brain') && path.resolve(arg('reask-brain')!),
});

/** A worker's job, as it crosses the process boundary. */
type WireJob = {
    run: CorpusRun;
    level: string;
    t: number;
    alternative: string;
    kind: string;
    jev?: { rank: number; probability: number };
    options: LevelOptions;
};

/**
 * The run log (and button-level reask choices) of the last recording this process read. One only: a
 * corpus interleaves seeds, so a cache by recording grows to every seed's log (~10 MB each) per worker.
 */
let lastLog: { recording: string; level: string; log: RunLog; asked?: Map<number, string> } | undefined;

async function playWire(job: WireJob) {
    if (lastLog?.recording !== job.run.recording || lastLog.level !== job.level) {
        lastLog = undefined;
        const log = readRunLog(job.run.recording);
        const asked = job.level === 'button' ? await reaskChoices(log, job.options) : undefined;
        lastLog = { recording: job.run.recording, level: job.level, log, asked };
    }
    const { log, asked } = lastLog;
    const [level] = levelsFor([job.level], job.options, asked);
    const point = level.points(log).find((p) => Math.abs(p.t - job.t) < 1e-9);
    if (!point) throw new Error(`no ${job.level} point at ${job.t} in ${job.run.recording}`);
    const started = Date.now();
    const row = await playJob(
        { run: job.run, point, alternative: job.alternative, kind: job.kind, jev: job.jev },
        level,
        log,
    );
    process.stderr.write(
        `seed ${job.run.seed} ${job.level} t=${job.t.toFixed(1)} ${job.alternative}: ${((Date.now() - started) / 1000).toFixed(1)} s
`,
    );
    return row;
}

/** Plays `jobs` on `workers` worker processes, each taking the next job as it finishes one. */
async function playPool(jobs: readonly WireJob[], workers: number) {
    if (workers === 1) {
        const rows: BranchRow[] = [];
        for (const job of jobs) rows.push(await playWire(job));
        return rows;
    }
    const queue = [...jobs];
    const rows: BranchRow[] = [];
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
                    child.on('message', (row) => {
                        rows.push(row as BranchRow);
                        next();
                    });
                    child.once('error', reject);
                    child.once('exit', (code) => (code ? reject(new Error(`worker exit ${code}`)) : resolve()));
                    next();
                }),
        ),
    );
    return rows;
}

if (process.send) {
    process.on('message', (job: WireJob) => {
        void playWire(job).then(
            (row) => process.send?.(row),
            (e: unknown) => {
                process.stderr.write(`${(e as Error).stack ?? String(e)}
`);
                process.exit(1);
            },
        );
    });
} else {
    void main().catch((e: unknown) => {
        process.stderr.write(`${(e as Error).stack ?? String(e)}
`);
        process.exit(1);
    });
}

async function main() {
    const command = process.argv[2];
    if (command === 'points') return points();
    if (command === 'fork') return forkOne();
    if (command === 'prove') return prove();
    if (command === 'corpus') return corpus();
    if (command === 'mine') return mineCommand();
    if (command === 'join-ledger') return joinLedger();
    throw new Error('usage: branch points|fork|prove|corpus|mine|join-ledger (see the header of src/cli/branch.ts)');
}

async function points() {
    const recording = path.resolve(required('recording'));
    const log = readRunLog(recording);
    const names = (arg('level') ?? 'strategic,tactical').split(',');
    const out = levelsFor(names, levelOptions(), await reaskChoices(log, levelOptions())).flatMap((level) =>
        level.points(log).map((p) => ({
            level: p.level,
            t: Number(p.t.toFixed(2)),
            reasons: p.reasons,
            taken: p.taken,
            orders: p.state.orders,
            ...(p.state.heard ? { heard: p.state.heard } : {}),
            enemy: p.state.nearestEnemy,
            armor: p.state.armor,
            energy: p.state.energy,
            alternatives: level.alternatives(p, log).map((a) => a.id),
        })),
    );
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

async function forkOne() {
    const recording = path.resolve(required('recording'));
    const crew = path.resolve(required('crew'));
    const t = Number(required('t'));
    const timeoutSeconds = Number(arg('timeout', '400'));
    const log = readRunLog(recording);
    const [level] = levelsFor([required('level')], levelOptions(), await reaskChoices(log, levelOptions()));
    const point = level.points(log).find((p) => Math.abs(p.t - t) < 0.01);
    if (!point) throw new Error(`no ${level.name} point at ${t}; list them with "branch points"`);
    const alternative = level.alternatives(point, log).find((a) => a.id === required('alt'));
    if (!alternative) {
        throw new Error(
            `alternatives at ${t}: ${level
                .alternatives(point, log)
                .map((a) => a.id)
                .join(', ')}`,
        );
    }
    const run = { crew, timeoutSeconds, ...runOf(recording) };
    const replay = await runBranch(run, point.t);
    const branched = await runBranch(run, point.t, alternative.intervention);
    const recorded = fingerprint(recording, point.t);
    process.stdout.write(
        JSON.stringify(
            {
                point: { t: point.t, reasons: point.reasons, taken: point.taken, orders: point.state.orders },
                alternative: alternative.id,
                replay,
                branch: branched,
                replayMatchesRecording: replay.whole === recorded.whole,
                prefixMatches: branched.prefix === recorded.prefix,
                delta: {
                    value: branched.value !== null && replay.value !== null ? branched.value - replay.value : null,
                    kills: branched.kills - replay.kills,
                },
            },
            null,
            2,
        ) + '\n',
    );
}

async function prove() {
    const run = {
        crew: path.resolve(required('crew')),
        scenario: required('scenario'),
        seed: Number(required('seed')),
        timeoutSeconds: Number(arg('timeout', '400')),
    };
    const a = await runBranch(run, 0);
    const b = await runBranch(run, 0);
    const recording = arg('recording');
    const recorded = recording ? fingerprint(path.resolve(recording), 0) : undefined;
    process.stdout.write(
        JSON.stringify(
            {
                first: a,
                second: b,
                identical: JSON.stringify(a) === JSON.stringify(b),
                ...(recorded ? { matchesRecording: recorded.whole === a.whole } : {}),
            },
            null,
            2,
        ) + '\n',
    );
}

async function corpus() {
    const runsDir = path.resolve(required('runs'));
    const crew = path.resolve(required('crew'));
    const scenario = required('scenario');
    const out = path.resolve(required('out'));
    const budget = Number(arg('budget', '400'));
    const workers = Math.max(1, Number(arg('workers', '1')));
    const options = levelOptions();
    const names = (arg('levels') ?? 'strategic,tactical').split(',');
    const results = JSON.parse(
        fs.readFileSync(path.join(runsDir, `${scenario}-crews.json`), 'utf8'),
    ) as CrewRunResult[];
    const crewName = (JSON.parse(fs.readFileSync(crew, 'utf8')) as { name: string }).name;
    const runs = results
        .filter((r) => r.crew === crewName && r.recording)
        .map((r) => {
            const recording = path.join(runsDir, crewName, path.basename(r.recording!));
            const run: CorpusRun = {
                crew,
                scenario,
                seed: r.seed,
                timeoutSeconds: r.timeoutSeconds,
                recording,
                baseline: { killed: r.killed, seconds: r.seconds, kills: r.kills, value: r.score?.value ?? null },
            };
            return run;
        });
    // one run log at a time: holding every seed's log through the corpus costs ~10 MB a seed
    const planned: ReturnType<typeof planCorpus> = [];
    for (const run of runs) {
        const log = readRunLog(run.recording);
        planned.push(
            ...planCorpus([{ run, log }], levelsFor(names, options, await reaskChoices(log, options)), Infinity),
        );
    }
    const jev = await jevProposals(planned, runs, scenario);
    // Jev-proposed branches first (unmeasured, low-confidence decisions before the rest), then
    // round-robin over runs and levels, so a cut budget still covers every seed at every level
    const seen = new Map<string, number>();
    const order = planned
        .map((job) => {
            const key = `${job.run.seed}/${job.level.name}`;
            const rank = seen.get(key) ?? 0;
            seen.set(key, rank + 1);
            const at = proposalKey(job.run.seed, job.level.name, job.point.t);
            const proposal = jev.proposals.get(at)?.find((p) => p.alternative === job.alternative);
            const priority = proposal ? (jev.priority.get(at) ?? 0) : Infinity;
            return { job, rank, proposal, priority };
        })
        .sort(
            (a, b) =>
                a.priority - b.priority ||
                (a.proposal?.rank ?? 0) - (b.proposal?.rank ?? 0) ||
                a.rank - b.rank ||
                a.job.run.seed - b.job.run.seed ||
                a.job.level.name.localeCompare(b.job.level.name),
        )
        .slice(0, budget);
    const wire: WireJob[] = order.map(({ job: j, proposal }) => ({
        run: j.run,
        level: j.level.name,
        t: j.point.t,
        alternative: j.alternative,
        kind: j.kind,
        ...(proposal ? { jev: { rank: proposal.rank, probability: proposal.probability } } : {}),
        options,
    }));
    process.stderr.write(`${runs.length} runs, ${wire.length} branches planned, ${workers} worker(s)\n`);
    const started = Date.now();
    const rows = (await playPool(wire, workers)).sort(
        (a, b) => a.seed - b.seed || a.t - b.t || a.alternative.localeCompare(b.alternative),
    );
    const wall = (Date.now() - started) / 1000;
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'branches.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const header = `${scenario}, crew ${crewName}, ${runs.length} runs, ${rows.length} branches, levels ${names.join(', ')}, budget ${budget}, ${workers} worker(s), wall ${wall.toFixed(0)} s${jev.note}`;
    fs.writeFileSync(path.join(out, 'corpus.md'), corpusTable(rows, header));
    const report = mineReport(rows, mine(rows));
    fs.writeFileSync(path.join(out, 'mine.md'), `${header}\n\n${report}`);
    process.stdout.write(`${header}\nwrote ${out}/branches.jsonl, corpus.md, mine.md\n`);
    if (jev.rows.length) {
        // the proposal decisions, with what their proposals were worth
        const joined = joinPayouts(jev.rows, rows);
        writeRowsAtomic(path.join(out, 'jev-decisions.jsonl'), joined);
        const ledger = arg('jev-decisions') ?? ledgerFromEnv();
        if (ledger) appendRows(path.resolve(ledger), joined);
    }
    const diverged = rows.filter((r) => !r.prefixMatches);
    if (diverged.length) {
        // a branch that did not replay its recording up to its point compares nothing: re-record before reading
        process.stderr.write(
            `DIVERGED: ${diverged.length} of ${rows.length} branches did not replay their recording up to their point (excluded from mine.md); re-record the runs on this code\n`,
        );
        process.exitCode = 1;
    }
}

type Planned = ReturnType<typeof planCorpus>[number];

/**
 * `--jev-proposals K`: asks the Jev captain (`--jev-brain`, default brains/captain-orders.v1.json) for
 * its top K alternatives at every strategic and tactical point, within the spend guard (`--jev-ledger`,
 * `--jev-cap-usd`). A refused reservation sends nothing and leaves the corpus enumerated-only. With
 * `--jev-index`, points whose proposal decision is unmeasured and low-confidence are played first.
 */
async function jevProposals(
    planned: readonly Planned[],
    runs: readonly CorpusRun[],
    scenario: string,
) {
    const none = {
        proposals: new Map<string, Proposal[]>(),
        priority: new Map<string, number>(),
        rows: [] as DecisionRow[],
        note: '',
    };
    const k = Number(arg('jev-proposals', '0'));
    if (!k) return none;
    applyCacheFlags();
    const brain = arg('jev-brain') ?? path.join(__dirname, '../../brains/captain-orders.v1.json');
    const spec = loadBrainSpec(path.resolve(brain));
    // Jev lane only: every seed's log is needed for the proposal prompts
    const logBySeed = new Map(runs.map((r) => [r.seed, readRunLog(r.recording)]));
    const asked = new Map<string, Planned>();
    for (const job of planned) {
        if (job.level.name !== 'button') asked.set(proposalKey(job.run.seed, job.level.name, job.point.t), job);
    }
    const result = await proposeAlternatives(
        [...asked.values()].map((job) => ({
            run: `${process.env.RUN_NAME ?? 'corpus'}/${path.basename(job.run.recording, '.sgr')}`,
            scenario,
            seed: job.run.seed,
            recording: job.run.recording,
            point: job.point,
            level: job.level,
            log: logBySeed.get(job.run.seed)!,
        })),
        spec,
        k,
        {
            ledger: path.resolve(arg('jev-ledger') ?? '/training-archive/jev-ledger.jsonl'),
            capUsd: Number(arg('jev-cap-usd', '10')),
            job: process.env.RUN_NAME ?? `corpus-${scenario}`,
        },
        answerCacheFromEnv(),
        () => jevClient(),
    );
    if (result.refused) {
        process.stderr.write(`${result.reason}: no Jev request sent, the corpus stays enumerated-only\n`);
        return { ...none, note: `, jev refused ($${result.total.toFixed(4)} spent or held)` };
    }
    const index = arg('jev-index') ? readRows(path.resolve(arg('jev-index')!)) : [];
    const rank = coveragePriority([...index, ...result.rows]);
    const known = new Map(index.map((r) => [r.id, r]));
    const priority = new Map<string, number>();
    for (const row of result.rows) {
        const p = rank(known.get(row.id) ?? row);
        for (const level of ['strategic', 'tactical']) priority.set(proposalKey(row.seed, level, row.t), p);
    }
    const usd = result.rows.reduce((a, r) => a + r.usd, 0);
    process.stderr.write(
        `jev: ${result.rows.length} proposal requests, ${result.rows.filter((r) => r.cacheHit).length} from the cache, ${result.paidTokens} tokens paid ($${usd.toFixed(4)})\n`,
    );
    return {
        proposals: result.proposals,
        priority,
        rows: result.rows,
        note: `, jev top ${k} at ${result.proposals.size} points ($${usd.toFixed(4)})`,
    };
}

/**
 * Fills decision-ledger payouts from branch corpora and merges the rows into the cumulative index;
 * prints coverage (measured / total) per scenario.
 */
function joinLedger() {
    const many = (name: string) =>
        process.argv.flatMap((a, i) =>
            a === `--${name}` && process.argv[i + 1] ? [path.resolve(process.argv[i + 1])] : [],
        );
    const index = path.resolve(required('index'));
    const branches = many('corpus').flatMap((file) =>
        fs
            .readFileSync(file, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map((l) => JSON.parse(l) as BranchRow),
    );
    const joined = joinPayouts(mergeIndex(readRows(index), many('ledger').flatMap(readRows)), branches);
    writeRowsAtomic(index, joined);
    process.stdout.write(JSON.stringify({ rows: joined.length, coverage: coverage(joined) }, null, 2) + '\n');
}

function mineCommand() {
    const file = path.resolve(required('corpus'));
    const rows = fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as BranchRow);
    process.stdout.write(mineReport(rows, mine(rows, Number(arg('min', '3')))) + '\n');
}
