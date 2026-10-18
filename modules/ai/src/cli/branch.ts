/**
 * Counterfactual branching over recorded crew runs: replay a run from its seed, leave it at a decision
 * point, play an alternative decision, and compare the outcome with the recorded run.
 *
 *   npm --prefix modules/ai run branch -- points --recording <x.sgr> [--level strategic|tactical|button] [--station helms --control afterBurner]
 *   npm --prefix modules/ai run branch -- fork --recording <x.sgr> --crew <crew.json> --t <s> --level <level> --alt <id> [--timeout 400]
 *   npm --prefix modules/ai run branch -- prove --crew <crew.json> --scenario <rung> --seed <n> [--timeout 400] [--recording <x.sgr>]
 *   npm --prefix modules/ai run branch -- corpus --runs <train out dir> --crew <crew.json> --scenario <rung> [--levels strategic,tactical] [--budget 400] [--workers 4] [--window 30] --out <dir>
 *   npm --prefix modules/ai run branch -- mine --corpus <dir>/branches.jsonl
 *
 * The scenario and seed of a recording come from its name (`<scenario>_seed<N>.sgr`). Seats must be
 * deterministic (reference, or Jev answered from the answer cache) for a replay to match its recording.
 */
import { BranchRow, CorpusRun, planCorpus, playJob } from '../branching/corpus';
import { DecisionLevel, buttonLevel, setTacticalWindow, strategicLevel, tacticalLevel } from '../branching/levels';
import { RunLog, readRunLog } from '../branching/run-log';
import { fingerprint, runBranch } from '../branching/fork';
import { loadBrainSpec, makeReferencePolicy, withOrderBoard } from '@starwards/bots';
import { mine, mineReport } from '../branching/mine';

import { CrewRunResult } from '../training/train-crew';
import { fork as forkProcess } from 'node:child_process';
import fs from 'node:fs';
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
type WireJob = { run: CorpusRun; level: string; t: number; alternative: string; kind: string; options: LevelOptions };

async function playWire(jobs: WireJob[]) {
    const logs = new Map<string, { log: RunLog; asked?: Map<number, string> }>();
    const rows: BranchRow[] = [];
    for (const job of jobs) {
        let read = logs.get(job.run.recording);
        if (!read) {
            const log = readRunLog(job.run.recording);
            read = { log, asked: job.level === 'button' ? await reaskChoices(log, job.options) : undefined };
            logs.set(job.run.recording, read);
        }
        const { log, asked } = read;
        const [level] = levelsFor([job.level], job.options, asked);
        const point = level.points(log).find((p) => Math.abs(p.t - job.t) < 1e-9);
        if (!point) throw new Error(`no ${job.level} point at ${job.t} in ${job.run.recording}`);
        const started = Date.now();
        rows.push(await playJob({ run: job.run, point, alternative: job.alternative, kind: job.kind }, level, log));
        process.stderr.write(
            `seed ${job.run.seed} ${job.level} t=${job.t.toFixed(1)} ${job.alternative}: ${((Date.now() - started) / 1000).toFixed(1)} s\n`,
        );
    }
    return rows;
}

if (process.send) {
    process.once('message', (jobs: WireJob[]) => {
        void playWire(jobs).then((rows) => process.send?.(rows, () => process.exit(0)));
    });
} else {
    void main().catch((e: unknown) => {
        process.stderr.write(`${(e as Error).stack ?? String(e)}\n`);
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
    throw new Error('usage: branch points|fork|prove|corpus|mine (see the header of src/cli/branch.ts)');
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
            return { run, log: readRunLog(recording) };
        });
    const planned = (
        await Promise.all(
            runs.map(async (r) =>
                planCorpus([r], levelsFor(names, options, await reaskChoices(r.log, options)), Infinity),
            ),
        )
    ).flat();
    // round-robin over runs, so a cut budget still covers every seed
    const order = planned
        .map((job, i) => ({ job, rank: planned.slice(0, i).filter((j) => j.run.seed === job.run.seed).length }))
        .sort((a, b) => a.rank - b.rank || a.job.run.seed - b.job.run.seed)
        .slice(0, budget)
        .map((x) => x.job);
    const wire: WireJob[] = order.map((j) => ({
        run: j.run,
        level: j.level.name,
        t: j.point.t,
        alternative: j.alternative,
        kind: j.kind,
        options,
    }));
    process.stderr.write(`${runs.length} runs, ${wire.length} branches planned, ${workers} worker(s)\n`);
    const started = Date.now();
    const shards: WireJob[][] = Array.from({ length: workers }, () => []);
    wire.forEach((job, i) => shards[i % workers].push(job));
    const rows = (
        workers === 1
            ? await playWire(shards[0])
            : (
                  await Promise.all(
                      shards.map(
                          (jobs) =>
                              new Promise<BranchRow[]>((resolve, reject) => {
                                  const child = forkProcess(__filename, [], { execArgv: process.execArgv });
                                  child.once('message', (r) => resolve(r as BranchRow[]));
                                  child.once('error', reject);
                                  child.once('exit', (code) => code && reject(new Error(`worker exit ${code}`)));
                                  child.send(jobs);
                              }),
                      ),
                  )
              ).flat()
    ).sort((a, b) => a.seed - b.seed || a.t - b.t || a.alternative.localeCompare(b.alternative));
    const wall = (Date.now() - started) / 1000;
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'branches.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const header = `${scenario}, crew ${crewName}, ${runs.length} runs, ${rows.length} branches, levels ${names.join(', ')}, budget ${budget}, ${workers} worker(s), wall ${wall.toFixed(0)} s`;
    fs.writeFileSync(path.join(out, 'corpus.md'), corpusTable(rows, header));
    const report = mineReport(rows, mine(rows));
    fs.writeFileSync(path.join(out, 'mine.md'), `${header}\n\n${report}`);
    process.stdout.write(`${header}\nwrote ${out}/branches.jsonl, corpus.md, mine.md\n`);
}

function corpusTable(rows: readonly BranchRow[], header: string) {
    const f = (n: number | null | undefined, d = 3) => (n === null || n === undefined ? '–' : n.toFixed(d));
    return [
        `# Branch corpus`,
        '',
        header,
        '',
        '| seed | level | t | reasons | enemy (m) | armor | energy | orders in force | taken | alternative | value recorded → branch | Δ value | Δ kills | prefix |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        ...rows.map(
            (r) =>
                `| ${r.seed} | ${r.level} | ${r.t.toFixed(1)} | ${r.reasons.join('; ')} | ${r.state.nearestEnemy?.distance ?? '–'} | ${f(r.state.armor, 2)} | ${f(r.state.energy, 2)} | ${r.state.orders} | ${r.taken} | ${r.alternative} | ${f(r.baseline.value)} → ${f(r.outcome.value)} | ${f(r.delta.value)} | ${r.delta.kills} | ${r.prefixMatches ? 'ok' : 'DIVERGED'} |`,
        ),
        '',
    ].join('\n');
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
