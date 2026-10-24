/**
 * Residual weapons RL (G1): PPO on forked W-waves episodes, then a paired eval on held-out forks.
 *
 *   npx ts-node --transpile-only src/cli/rl-train.ts --banks <guard waves out>[,<dir>...] --out <dir>
 *       [--steps 2000000] [--workers 12] [--batch 16384] [--fork-share 0.7] [--heldout 512]
 *       [--ref-coef 0.5] [--ref-steps 300000] [--ref-floor 0.5] [--explore 0.08] [--entropy 0.01] [--lr 3e-4] [--max-hours 0] [--eval] [--eval-only <policy.json>]
 *
 * Each worker process plays one episode at a time (the residual decider is process-wide). Writes
 * `curve.jsonl` (one row per update), `episodes.jsonl`, `ckpt-<steps>.json`, `policy.json`, and with
 * `--eval`/`--eval-only`: `eval.jsonl` and `eval.md` (policy vs all-reference on each held-out fork,
 * paired by reseed key).
 */
import { ChildProcess, fork as forkProcess } from 'node:child_process';
import { Fork, buildForks, pairedSummary, readGuardBank, sampleStart, splitBank } from '../rl/fork-bank';
import {
    HEADS,
    Nets,
    PPO_DEFAULTS,
    Sample,
    act,
    createNets,
    createOptimizers,
    gae,
    holdTarget,
    logProb,
    ppoUpdate,
    toHeads,
    valueOf,
} from '../rl/ppo';
import { rewards, runForkEpisode } from '../rl/env';
import { FEATURE_NAMES } from '../rl/features';
import { REFERENCE_HEADS } from '@starwards/bots';
import { RunSpec } from '../branching/fork';
import fs from 'node:fs';
import { mix } from '@starwards/core/internal';
import path from 'node:path';
import { rng } from '../rl/mlp';

function arg(name: string, fallback?: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

const GAMMA = 0.999;
const LAMBDA = 0.95;

type Job = {
    id: number;
    run: RunSpec;
    start: Fork;
    key: number;
    /** Policy params, or none for all-reference. */
    policy?: { sizes: number[]; params: number[] };
    greedy: boolean;
    explore: number;
    sampleSeed: number;
};
type Result = {
    id: number;
    start: Fork;
    key: number;
    pass: boolean;
    seconds: number;
    obs: number[][];
    actions: number[][];
    masks: number[][];
    logps: number[];
    logpsPolicy: number[];
    rewards: number[];
    phi0: number;
    trip: { missilesFired: number; kills: number; heEmptySeconds: number; firstLossAt: number | null };
    nonRef: number[];
    wallSeconds: number;
};

async function play(job: Job): Promise<Result> {
    const wall = Date.now();
    const u = rng(job.sampleSeed);
    const nets = job.policy && {
        sizes: job.policy.sizes,
        params: Float64Array.from(job.policy.params),
    };
    const obs: number[][] = [];
    const actions: number[][] = [];
    const masks: number[][] = [];
    const logps: number[] = [];
    const logpsPolicy: number[] = [];
    const nonRef = HEADS.map(() => 0);
    const hold = { held: 0, since: -Infinity };
    const { outcome, steps, trip } = await runForkEpisode(job.run, { t: job.start.t, key: job.key }, (o, seconds) => {
        if (!nets) return REFERENCE_HEADS;
        const { action, probs, behaviour } = act(nets, o, u, job.greedy, job.explore);
        const { applied, mask } = holdTarget(hold, action, seconds);
        obs.push(o);
        actions.push(applied);
        masks.push(mask);
        logps.push(logProb(behaviour, applied, mask));
        logpsPolicy.push(logProb(probs, applied, mask));
        applied.forEach((a, h) => (nonRef[h] += a ? 1 : 0));
        return toHeads(applied);
    });
    return {
        id: job.id,
        start: job.start,
        key: job.key,
        pass: outcome.killed,
        seconds: outcome.seconds,
        obs,
        actions,
        masks,
        logps,
        logpsPolicy,
        rewards: rewards(steps, outcome.killed, GAMMA),
        phi0: steps[0]?.phi ?? 0,
        trip,
        nonRef,
        wallSeconds: (Date.now() - wall) / 1000,
    };
}

/** A pool of long-lived worker processes; `run` hands each job to the next free worker. */
function workerPool(n: number) {
    const free: ChildProcess[] = [];
    const waiting: ((w: ChildProcess) => void)[] = [];
    for (let i = 0; i < n; i++) free.push(forkProcess(__filename, [], { execArgv: process.execArgv }));
    const take = () => new Promise<ChildProcess>((res) => (free.length ? res(free.pop()!) : waiting.push(res)));
    const release = (w: ChildProcess) => (waiting.length ? waiting.shift()!(w) : free.push(w));
    return {
        async run(job: Job): Promise<Result> {
            const w = await take();
            return new Promise((res, rej) => {
                const onExit = (code: number) => rej(new Error(`worker exited ${code} on job ${job.id}`));
                w.once('exit', onExit);
                w.once('message', (r: Result) => {
                    w.off('exit', onExit);
                    release(w);
                    res(r);
                });
                w.send(job);
            });
        },
        close: () => [...free].forEach((w) => w.kill()),
    };
}

const netsJson = (nets: Nets) => ({
    features: FEATURE_NAMES.length,
    policy: { sizes: [...nets.policy.sizes], params: [...nets.policy.params] },
    value: { sizes: [...nets.value.sizes], params: [...nets.value.params] },
});

async function train(o: {
    out: string;
    runOf: (seed: number) => RunSpec;
    bank: ReturnType<typeof splitBank>;
    pool: ReturnType<typeof workerPool>;
    workers: number;
}) {
    const steps = Number(arg('steps', '2000000'));
    const batchSteps = Number(arg('batch', '16384'));
    const forkShare = Number(arg('fork-share', '0.7'));
    const refCoef0 = Number(arg('ref-coef', '0.5'));
    const refSteps = Number(arg('ref-steps', '300000'));
    const maxHours = Number(arg('max-hours', '0'));
    const lr = Number(arg('lr', String(PPO_DEFAULTS.lr)));
    const refFloor = Number(arg('ref-floor', String(PPO_DEFAULTS.refFloor)));
    const explore = Number(arg('explore', String(PPO_DEFAULTS.explore)));
    const entropy = Number(arg('entropy', String(PPO_DEFAULTS.entropy)));
    const nets = createNets(FEATURE_NAMES.length, 1);
    const opt = createOptimizers(nets);
    const u = rng(2);
    const began = Date.now();
    let total = 0;
    let episodes = 0;
    let jobId = 0;
    let buffer: Result[] = [];
    let recent: Result[] = [];
    let nextCkpt = 200_000;
    const curve = path.join(o.out, 'curve.jsonl');
    const episodesFile = path.join(o.out, 'episodes.jsonl');
    const out = (f: string, row: unknown) => fs.appendFileSync(f, JSON.stringify(row) + '\n');
    const done = () => total >= steps || (maxHours > 0 && Date.now() - began > maxHours * 3_600_000);
    const update = () => {
        const samples: Sample[] = [];
        for (const r of buffer) {
            const values = r.obs.map((x) => valueOf(nets, x));
            const { adv, returns } = gae(r.rewards, values, GAMMA, LAMBDA);
            r.obs.forEach((x, i) =>
                samples.push({
                    obs: x,
                    action: r.actions[i],
                    mask: r.masks[i],
                    logp: r.logps[i],
                    logpPolicy: r.logpsPolicy[i],
                    adv: adv[i],
                    ret: returns[i],
                }),
            );
        }
        const refCoef = refCoef0 * Math.max(0, 1 - total / refSteps);
        const t0 = Date.now();
        const stats = ppoUpdate(nets, opt, samples, { ...PPO_DEFAULTS, lr, refCoef, refFloor, explore, entropy }, u);
        const hours = (Date.now() - began) / 3_600_000;
        const n = recent.length || 1;
        const recentSteps = recent.reduce((a, r) => a + r.obs.length, 0) || 1;
        out(curve, {
            steps: total,
            episodes,
            hours: +hours.toFixed(3),
            episodesPerHour: +(episodes / hours).toFixed(1),
            pass: +(recent.filter((r) => r.pass).length / n).toFixed(3),
            passForks: rate(recent.filter((r) => r.start.t > 0)),
            passWhole: rate(recent.filter((r) => r.start.t === 0)),
            meanReturn: +(recent.reduce((a, r) => a + r.rewards.reduce((x, y) => x + y, 0), 0) / n).toFixed(3),
            nonRef: Object.fromEntries(
                HEADS.map((h, i) => [h, +(recent.reduce((a, r) => a + r.nonRef[i], 0) / recentSteps).toFixed(3)]),
            ),
            trip: {
                missilesPerKill: +(
                    sum(recent, (r) => r.trip.missilesFired) /
                    Math.max(
                        1,
                        sum(recent, (r) => r.trip.kills),
                    )
                ).toFixed(2),
                heEmptySeconds: +(sum(recent, (r) => r.trip.heEmptySeconds) / n).toFixed(1),
                firstLossAt: mean(recent.map((r) => r.trip.firstLossAt).filter((x): x is number => x !== null)),
            },
            refCoef: +refCoef.toFixed(3),
            updateSeconds: (Date.now() - t0) / 1000,
            kl: +stats.kl.toFixed(4),
            clipFrac: +stats.clipFrac.toFixed(4),
            entropy: +stats.entropy.toFixed(4),
            refProb: +stats.refProb.toFixed(4),
            valueLoss: +stats.valueLoss.toFixed(4),
            headEntropy: Object.fromEntries(HEADS.map((h, i) => [h, +stats.headEntropy[i].toFixed(4)])),
            policyNonRef: Object.fromEntries(HEADS.map((h, i) => [h, +(1 - stats.headRefProb[i]).toFixed(4)])),
        });
        buffer = [];
        recent = [];
        if (total >= nextCkpt) {
            fs.writeFileSync(path.join(o.out, `ckpt-${total}.json`), JSON.stringify(netsJson(nets)));
            nextCkpt += 200_000;
        }
    };
    const job = (): Job => {
        const start = sampleStart(o.bank, u, forkShare);
        return {
            id: jobId++,
            run: o.runOf(start.seed),
            start,
            key: Math.floor(u() * 2 ** 31),
            policy: { sizes: [...nets.policy.sizes], params: [...nets.policy.params] },
            greedy: false,
            explore,
            sampleSeed: Math.floor(u() * 2 ** 31),
        };
    };
    const lane = async () => {
        while (!done()) {
            const r = await o.pool.run(job());
            if (done()) return;
            episodes++;
            out(episodesFile, {
                id: r.id,
                seed: r.start.seed,
                t: r.start.t,
                key: r.key,
                pass: r.pass,
                seconds: r.seconds,
                steps: r.obs.length,
                return: +r.rewards.reduce((a, b) => a + b, 0).toFixed(3),
                trip: r.trip,
                nonRef: r.nonRef,
                wall: r.wallSeconds,
            });
            if (!r.obs.length) continue;
            total += r.obs.length;
            buffer.push(r);
            recent.push(r);
            if (buffer.reduce((a, x) => a + x.obs.length, 0) >= batchSteps) update();
        }
    };
    await Promise.all(Array.from({ length: o.workers }, lane));
    if (buffer.length) update();
    fs.writeFileSync(path.join(o.out, 'policy.json'), JSON.stringify(netsJson(nets)));
    return nets;
}

const sum = (rs: Result[], f: (r: Result) => number) => rs.reduce((a, r) => a + f(r), 0);
const mean = (xs: number[]) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : null);
const rate = (rs: Result[]) => (rs.length ? +(rs.filter((r) => r.pass).length / rs.length).toFixed(3) : null);

async function evaluate(o: {
    out: string;
    runOf: (seed: number) => RunSpec;
    forks: Fork[];
    pool: ReturnType<typeof workerPool>;
    policy: { sizes: number[]; params: number[] };
}) {
    const file = path.join(o.out, 'eval.jsonl');
    type Row = { seed: number; t: number; key: number; arm: string; pass: boolean };
    const rows: Row[] = fs.existsSync(file)
        ? fs
              .readFileSync(file, 'utf8')
              .split('\n')
              .filter(Boolean)
              .map((l) => JSON.parse(l) as Row)
        : [];
    const have = new Set(rows.map((r) => `${r.seed}@${r.t}@${r.arm}`));
    const jobs = o.forks.flatMap((f, i) =>
        (['policy', 'reference'] as const)
            .filter((arm) => !have.has(`${f.seed}@${f.t}@${arm}`))
            .map((arm) => ({
                arm,
                job: {
                    id: i,
                    run: o.runOf(f.seed),
                    start: f,
                    key: mix(mix(f.seed, f.t), 0x5eed),
                    policy: arm === 'policy' ? o.policy : undefined,
                    greedy: true,
                    explore: 0,
                    sampleSeed: mix(f.seed, f.t),
                } satisfies Job,
            })),
    );
    await Promise.all(
        jobs.map(async ({ arm, job }) => {
            const r = await o.pool.run(job);
            const row = {
                seed: r.start.seed,
                t: r.start.t,
                key: r.key,
                arm,
                pass: r.pass,
                seconds: r.seconds,
                steps: r.obs.length,
                trip: r.trip,
                nonRef: r.nonRef,
            };
            fs.appendFileSync(file, JSON.stringify(row) + '\n');
            rows.push(row);
        }),
    );
    const by = new Map<string, { policy?: boolean; reference?: boolean }>();
    for (const r of rows) {
        const k = `${r.seed}@${r.t}`;
        by.set(k, { ...by.get(k), [r.arm]: r.pass });
    }
    const pairs = [...by.values()].filter(
        (p): p is { policy: boolean; reference: boolean } => p.policy !== undefined && p.reference !== undefined,
    );
    const s = pairedSummary(pairs);
    const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
    const md = [
        '# RL G1 eval: residual weapons vs all-reference, held-out forks (paired by reseed key)',
        '',
        `n ${s.n}; policy ${pct(s.policyPass)}, reference ${pct(s.referencePass)}; diff ${pct(s.diff)} [95% bootstrap ${pct(s.ci[0])}, ${pct(s.ci[1])}]; discordant policy-only ${s.policyOnly}, reference-only ${s.referenceOnly}`,
        '',
        `G1 gate (diff >= +3 pp, CI excl. 0): ${s.diff >= 0.03 && s.ci[0] > 0 ? 'PASS' : 'FAIL'}`,
        '',
    ].join('\n');
    fs.writeFileSync(path.join(o.out, 'eval.md'), md);
    process.stdout.write(md);
}

async function main() {
    const out = path.resolve(arg('out')!);
    fs.mkdirSync(out, { recursive: true });
    const crew = path.resolve(arg('crew', path.join(__dirname, '../../crews/captain-guard-rlw.json'))!);
    const timeoutSeconds = Number(arg('timeout', '1500'));
    const workers = Math.min(12, Number(arg('workers', '12')));
    const runOf = (seed: number): RunSpec => ({ crew, scenario: 'W-waves', seed, timeoutSeconds });
    const bank = splitBank(buildForks(readGuardBank(arg('banks')!.split(','))), Number(arg('heldout', '512')));
    fs.writeFileSync(path.join(out, 'bank.json'), JSON.stringify(bank));
    process.stderr.write(
        `bank: ${bank.train.length} train forks over ${bank.trainSeeds.length} seeds, ${bank.heldOut.length} held out\n`,
    );
    const pool = workerPool(workers);
    try {
        const evalOnly = arg('eval-only');
        const policy = evalOnly
            ? (JSON.parse(fs.readFileSync(evalOnly, 'utf8')) as ReturnType<typeof netsJson>).policy
            : netsJson(await train({ out, runOf, bank, pool, workers })).policy;
        if (evalOnly || process.argv.includes('--eval'))
            await evaluate({ out, runOf, forks: bank.heldOut, pool, policy });
    } finally {
        pool.close();
    }
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
} else if (require.main === module) {
    void main().then(
        () => process.exit(0),
        (e: unknown) => {
            process.stderr.write(`${(e as Error).stack ?? String(e)}\n`);
            process.exit(1);
        },
    );
}
