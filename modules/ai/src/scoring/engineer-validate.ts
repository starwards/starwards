/**
 * Matched-seed validation of the engineer score and the fit of its risk curve and weights. Reads
 * crew training runs made with `npm run train` on the same seeds, one crew per engineer policy
 * (crews `engineer-<policy>.json`), and prints a markdown report.
 *
 *   npm --prefix modules/ai run score:engineer -- --runs <train out dir> [--runs <dir> ...] [--out report.md]
 *
 * Two runs of a seed are compared over the same stretch of game time: from the start to the earlier
 * of their ends (a kill, the ship's loss, or the timeout), so a run that wins early is never averaged
 * against a run's long calm tail. Each run's weight-free components are cached beside its recording
 * as `<run>.ekpi2.json`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
    EngineerComponents,
    EngineerWeights,
    RISK_FEATURES,
    RiskModel,
    components,
    damageLookahead,
    kpiOf,
    observe,
    riskOf,
} from './engineer-kpi';
import { readEvents, readFrames } from './recording';

const PLAYER = 'GVTS';
const POLICIES = [
    'reference',
    'reference-repairing',
    'idle',
    'never-jump-start',
    'all-max',
    'random',
    'all-shutdown',
] as const;
type PolicyName = (typeof POLICIES)[number];

/** One frame: K's components, and whether the opponent is still alive. */
type Frame = EngineerComponents & { readonly targetAlive: boolean };

interface Run {
    readonly scenario: string;
    readonly seed: number;
    readonly policy: PolicyName;
    readonly frames: readonly Frame[];
    readonly end: number;
}

/** A labelled frame for the risk fit and the predictive check. */
interface Outcomes {
    /** Own integrity lost ≥ 0.02 (or the ship lost) in the next 30 s; null when the run ends first otherwise. */
    readonly hurt30: (number | null)[];
    /** 1 if the opponent dies by t+h, minus own integrity lost by t+h; null when the run ends first otherwise. */
    readonly outcome60: (number | null)[];
    readonly outcome120: (number | null)[];
}

function args(name: string) {
    return process.argv.flatMap((a, i) => (a === `--${name}` ? [process.argv[i + 1]] : []));
}

async function loadRun(sgr: string): Promise<{ frames: Frame[]; end: number; lost: boolean }> {
    const cache = sgr.replace(/\.sgr$/, '.ekpi2.json');
    if (fs.existsSync(cache))
        return JSON.parse(fs.readFileSync(cache, 'utf8')) as { frames: Frame[]; end: number; lost: boolean };
    const recorded = await readFrames(sgr);
    const seen = recorded.flatMap((f) => {
        const o = observe(f.t, f.saved, PLAYER);
        if (!o) return [];
        const alive = [...f.saved.fragment.space.getAll('Spaceship')].some((s) => s.id !== PLAYER && !s.destroyed);
        return [{ o, alive }];
    });
    const cs = components(
        seen.map((s) => s.o),
        readEvents(sgr),
        PLAYER,
    );
    const run = {
        frames: cs.map((c, i) => ({ ...c, targetAlive: seen[i].alive })),
        end: recorded.at(-1)?.t ?? 0,
        lost: seen.length < recorded.length,
    };
    fs.writeFileSync(cache, JSON.stringify(run));
    return run;
}

function outcomesOf(run: Run & { lost: boolean }): Outcomes {
    const f = run.frames;
    const at = (i: number, h: number) => {
        const t = f[i].t;
        const killed = f.findIndex((x, j) => j > i && !x.targetAlive && x.t <= t + h);
        if (killed >= 0) return { kill: 1, loss: f[i].integrity - f[killed].integrity };
        if (run.end < t + h) return run.lost ? { kill: 0, loss: f[i].integrity } : null;
        const last = f.findLastIndex((x) => x.t <= t + h);
        return { kill: 0, loss: f[i].integrity - f[last].integrity };
    };
    return {
        hurt30: f.map((_, i) => {
            const o = at(i, 30);
            return o ? (o.loss >= 0.02 ? 1 : 0) : null;
        }),
        outcome60: f.map((_, i) => {
            const o = at(i, 60);
            return o ? o.kill - o.loss : null;
        }),
        outcome120: f.map((_, i) => {
            const o = at(i, 120);
            return o ? o.kill - o.loss : null;
        }),
    };
}

type LoadedRun = Run & { lost: boolean; outcomes: Outcomes };

async function loadRuns(dirs: readonly string[]) {
    const runs: LoadedRun[] = [];
    for (const dir of dirs) {
        for (const crew of fs.readdirSync(dir)) {
            const policy = crew.replace(/^engineer-/, '') as PolicyName;
            if (!crew.startsWith('engineer-') || !POLICIES.includes(policy)) continue;
            for (const file of fs.readdirSync(path.join(dir, crew)).filter((f) => f.endsWith('.sgr'))) {
                const [, scenario, seed] = /^(.+)_seed(\d+)\.sgr$/.exec(file) ?? [];
                if (!scenario) continue;
                const loaded = await loadRun(path.join(dir, crew, file));
                const run = { scenario, seed: Number(seed), policy, ...loaded };
                runs.push({ ...run, outcomes: outcomesOf(run) });
                process.stderr.write('.');
            }
        }
    }
    process.stderr.write('\n');
    return runs;
}

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

/** Deterministic generator, so the report's intervals reproduce. */
function rng(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function bootstrap(deltas: readonly number[], resamples = 2000) {
    if (!deltas.length) return { mean: NaN, lo: NaN, hi: NaN, n: 0 };
    const next = rng(20261003);
    const means: number[] = [];
    for (let b = 0; b < resamples; b++) {
        let s = 0;
        for (let i = 0; i < deltas.length; i++) s += deltas[Math.floor(next() * deltas.length)];
        means.push(s / deltas.length);
    }
    means.sort((a, c) => a - c);
    return {
        mean: mean(deltas),
        lo: means[Math.floor(0.025 * resamples)],
        hi: means[Math.floor(0.975 * resamples)],
        n: deltas.length,
    };
}

/** Logistic regression of `hurt30` on the raw risk features, by projected gradient descent with non-negative coefficients. */
function fitRisk(runs: readonly LoadedRun[]): RiskModel {
    const xs: number[][] = [];
    const ys: number[] = [];
    for (const r of runs) {
        r.frames.forEach((f, i) => {
            const y = r.outcomes.hurt30[i];
            if (y === null) return;
            xs.push(RISK_FEATURES.map((k) => f.features[k]));
            ys.push(y);
        });
    }
    let bias = 0;
    const coef = RISK_FEATURES.map(() => 0);
    const rate = 0.5;
    for (let step = 0; step < 3000; step++) {
        let gb = 0;
        const g = coef.map(() => 0);
        for (let i = 0; i < xs.length; i++) {
            const z = xs[i].reduce((s, x, j) => s + coef[j] * x, bias);
            const err = 1 / (1 + Math.exp(-z)) - ys[i];
            gb += err;
            xs[i].forEach((x, j) => (g[j] += err * x));
        }
        bias -= (rate * gb) / xs.length;
        // more danger never lowers risk: every coefficient is kept non-negative
        coef.forEach((_, j) => (coef[j] = Math.max(0, coef[j] - (rate * g[j]) / xs.length - 1e-3 * coef[j])));
    }
    return { bias, coef };
}

type Scored = LoadedRun & { k: number[]; r: number[] };

const lookahead = new WeakMap<LoadedRun, Map<number, number[]>>();
const riskCache = new WeakMap<LoadedRun, { model: RiskModel; r: number[] }>();

function score(runs: readonly LoadedRun[], w: EngineerWeights, risk: RiskModel): Scored[] {
    return runs.map((run) => {
        let byEpsilon = lookahead.get(run);
        if (!byEpsilon) lookahead.set(run, (byEpsilon = new Map<number, number[]>()));
        let d60 = byEpsilon.get(w.epsilon);
        if (!d60) byEpsilon.set(w.epsilon, (d60 = damageLookahead(run.frames, w.epsilon)));
        let cached = riskCache.get(run);
        if (cached?.model !== risk)
            riskCache.set(run, (cached = { model: risk, r: run.frames.map((f) => riskOf(f.features, risk)) }));
        const r = cached.r;
        return { ...run, k: run.frames.map((f, i) => kpiOf(f, d60[i], r[i], w)), r };
    });
}

type Keep = (r: number) => boolean;

/** Per (scenario, seed) paired deltas of `a` minus `b`, each run averaged over the pair's common time. */
function paired(runs: readonly Scored[], a: PolicyName, b: PolicyName, keep: Keep = () => true): number[] {
    const by = new Map(runs.map((r) => [`${r.scenario}/${r.seed}/${r.policy}`, r]));
    const deltas: number[] = [];
    for (const x of runs.filter((r) => r.policy === a)) {
        const y = by.get(`${x.scenario}/${x.seed}/${b}`);
        if (!y) continue;
        const until = Math.min(x.end, y.end);
        const avg = (r: Scored) => mean(r.k.filter((_, i) => r.frames[i].t <= until && keep(r.r[i])));
        const d = avg(x) - avg(y);
        if (Number.isFinite(d)) deltas.push(d);
    }
    return deltas;
}

function terciles(runs: readonly Scored[]) {
    const risks = runs.flatMap((r) => r.r).sort((a, c) => a - c);
    return [risks[Math.floor(risks.length / 3)], risks[Math.floor((2 * risks.length) / 3)]] as const;
}

const tercile =
    (cuts: readonly [number, number], k: 0 | 1 | 2): Keep =>
    (r) =>
        k === 0 ? r < cuts[0] : k === 1 ? r >= cuts[0] && r < cuts[1] : r >= cuts[1];

const REQUIRED = [
    ['reference', 'idle', 'all'],
    ['idle', 'all-shutdown', 'all'],
    ['reference', 'all-max', 'high'],
] as const;

function effect(deltas: readonly number[]) {
    if (!deltas.length) return Infinity;
    const m = mean(deltas);
    const sd = Math.sqrt(mean(deltas.map((d) => (d - m) ** 2))) || 1e-9;
    return m / sd;
}

/** Within-tercile Pearson r of frame K with the h-second outcome, averaged over terciles. */
function predictive(runs: readonly Scored[], cuts: readonly [number, number], h: 60 | 120) {
    const corr: number[] = [];
    for (const k of [0, 1, 2] as const) {
        const keep = tercile(cuts, k);
        const pairs = runs.flatMap((r) =>
            r.k.flatMap((x, i) => {
                const y = (h === 60 ? r.outcomes.outcome60 : r.outcomes.outcome120)[i];
                return keep(r.r[i]) && y !== null ? [[x, y] as const] : [];
            }),
        );
        const mx = mean(pairs.map((p) => p[0]));
        const my = mean(pairs.map((p) => p[1]));
        let sxy = 0;
        let sxx = 0;
        let syy = 0;
        for (const [x, y] of pairs) {
            sxy += (x - mx) * (y - my);
            sxx += (x - mx) ** 2;
            syy += (y - my) ** 2;
        }
        corr.push(sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0);
    }
    return { mean: mean(corr), byTercile: corr };
}

/**
 * Reserve weights are set by design (`λ0` 0.3, `λ1` 0.4, `β` 3); `--free-reserve` fits them too, to
 * check whether a fit would choose them stably.
 */
const FREE_RESERVE = process.argv.includes('--free-reserve');

function grid(): EngineerWeights[] {
    const out: EngineerWeights[] = [];
    const reserve = FREE_RESERVE
        ? [0, 1, 3].flatMap((beta) =>
              [0, 0.1, 0.2, 0.3].flatMap((lambda0) => [0, 0.2, 0.4].map((lambda1) => ({ beta, lambda0, lambda1 }))),
          )
        : [{ beta: 3, lambda0: 0.3, lambda1: 0.4 }];
    for (const k of [0.5, 1, 2, 4])
        for (const n0 of [0.25, 0.5, 1])
            for (const r of reserve) for (const epsilon of [0.01, 0.05, 0.2]) out.push({ k, n0, ...r, epsilon });
    return out;
}

/**
 * Fits the risk curve, then the weights maximising the weakest required contrast over every
 * scenario, among those whose K predicts the 120 s outcome; when none does, the best of all.
 */
function fit(runs: readonly LoadedRun[]) {
    const risk = fitRisk(runs);
    const scenarios = [...new Set(runs.map((r) => r.scenario))];
    let best: { w: EngineerWeights; score: number; predictive: boolean } | undefined;
    for (const w of grid()) {
        const scored = score(runs, w, risk);
        const cuts = terciles(scored);
        const ok = predictive(scored, cuts, 120).mean > 0;
        if (best?.predictive && !ok) continue;
        let s = Infinity;
        for (const sc of scenarios) {
            const sub = scored.filter((r) => r.scenario === sc);
            for (const [a, b, where] of REQUIRED) {
                s = Math.min(s, effect(paired(sub, a, b, where === 'high' ? tercile(cuts, 2) : undefined)));
            }
        }
        if (!best || (ok && !best.predictive) || s > best.score) best = { w, score: s, predictive: ok };
    }
    return best && { ...best, risk };
}

const fmt = (x: number, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const ci = (b: ReturnType<typeof bootstrap>) =>
    b.n ? `${fmt(b.mean)} [${fmt(b.lo)}, ${fmt(b.hi)}] n=${b.n}${b.lo > 0 ? ' ✓' : b.hi < 0 ? ' ✗' : ''}` : '–';

async function main() {
    const runs = await loadRuns(args('runs').map((d) => path.resolve(d)));
    const scenarios = [...new Set(runs.map((r) => r.scenario))].sort();
    const seeds = [...new Set(runs.map((r) => r.seed))].sort((a, c) => a - c);
    const trainSeeds = new Set(seeds.slice(0, Math.ceil((2 * seeds.length) / 3)));
    const lines: string[] = [];
    const out = (s = '') => lines.push(s);

    const fitted = fit(runs.filter((r) => trainSeeds.has(r.seed)));
    if (!fitted) throw new Error('no runs to fit');
    const all = score(runs, fitted.w, fitted.risk);
    const test = all.filter((r) => !trainSeeds.has(r.seed));
    const cuts = terciles(all);
    out(
        `runs ${runs.length}; scenarios ${scenarios.join(', ')}; fit seeds ${[...trainSeeds].join(',')}; held-out ${seeds.filter((s) => !trainSeeds.has(s)).join(',')}`,
    );
    out();
    out(
        `risk model (fit seeds, P(integrity loss ≥ 0.02 in 30 s)): \`${JSON.stringify({ bias: +fitted.risk.bias.toFixed(3), coef: fitted.risk.coef.map((c) => +c.toFixed(3)) })}\` over ${RISK_FEATURES.join(', ')}`,
    );
    out();
    out(
        `weights: \`${JSON.stringify(fitted.w)}\`; weakest standardised fit-seed contrast ${fmt(fitted.score)}; predictive constraint ${fitted.predictive ? 'met' : 'NOT met'}`,
    );
    out();
    out(`risk tercile cuts: ${fmt(cuts[0])}, ${fmt(cuts[1])}. Frame share per tercile:`);
    out();
    out('| scenario | low | mid | high |');
    out('| --- | --- | --- | --- |');
    for (const s of scenarios) {
        const rs = all.filter((r) => r.scenario === s).flatMap((r) => r.r);
        out(
            `| ${s} | ${([0, 1, 2] as const).map((k) => fmt(rs.filter(tercile(cuts, k)).length / rs.length, 2)).join(' | ')} |`,
        );
    }
    out();
    const pairs: [PolicyName, PolicyName][] = [
        ['reference', 'idle'],
        ['idle', 'all-shutdown'],
        ['reference', 'all-max'],
        ['reference', 'random'],
        ['reference', 'never-jump-start'],
        ['reference-repairing', 'reference'],
    ];
    const table = (title: string, subset: readonly Scored[]) => {
        out(`### ${title}`);
        out();
        out("Paired Δ mean K over each pair's common time, 95% bootstrap CI over seeds. ✓ above 0, ✗ below.");
        out();
        out(`| scenario | ${pairs.map(([a, b]) => `${a} − ${b}`).join(' | ')} | reference − all-max (high risk) |`);
        out(`| --- |${pairs.map(() => ' --- |').join('')} --- |`);
        for (const s of [...scenarios, 'all']) {
            const sub = subset.filter((r) => s === 'all' || r.scenario === s);
            out(
                `| ${s} | ${pairs.map(([a, b]) => ci(bootstrap(paired(sub, a, b)))).join(' | ')} | ${ci(bootstrap(paired(sub, 'reference', 'all-max', tercile(cuts, 2))))} |`,
            );
        }
        out();
        out('reference − idle by risk tercile:');
        out();
        out('| scenario | low | mid | high |');
        out('| --- | --- | --- | --- |');
        for (const s of [...scenarios, 'all']) {
            const sub = subset.filter((r) => s === 'all' || r.scenario === s);
            out(
                `| ${s} | ${([0, 1, 2] as const).map((k) => ci(bootstrap(paired(sub, 'reference', 'idle', tercile(cuts, k))))).join(' | ')} |`,
            );
        }
        out();
    };
    table('All seeds', all);
    table('Held-out seeds', test);

    out('### Leave one scenario out (risk curve and weights fit on the other scenarios, all seeds)');
    out();
    out('| held out | weights | reference − idle | idle − all-shutdown | reference − all-max (high risk) |');
    out('| --- | --- | --- | --- | --- |');
    for (const s of scenarios) {
        const f = fit(runs.filter((r) => r.scenario !== s));
        if (!f) continue;
        const held = score(
            runs.filter((r) => r.scenario === s),
            f.w,
            f.risk,
        );
        const c = terciles(score(runs, f.w, f.risk));
        out(
            `| ${s} | \`${JSON.stringify(f.w)}\` | ${ci(bootstrap(paired(held, 'reference', 'idle')))} | ${ci(bootstrap(paired(held, 'idle', 'all-shutdown')))} | ${ci(bootstrap(paired(held, 'reference', 'all-max', tercile(c, 2))))} |`,
        );
    }
    out();
    out('### Predictive validity');
    out();
    out(
        'Within-risk-tercile Pearson r of frame K with the outcome (1 if the opponent dies by t+h, minus own integrity lost by t+h).',
    );
    out();
    out('| set | h | mean r | low | mid | high |');
    out('| --- | --- | --- | --- | --- | --- |');
    for (const [name, set] of [
        ['fit seeds', all.filter((r) => trainSeeds.has(r.seed))],
        ['held-out seeds', test],
    ] as const) {
        for (const h of [60, 120] as const) {
            const p = predictive(set, cuts, h);
            out(`| ${name} | ${h} | ${fmt(p.mean)} | ${p.byTercile.map((x) => fmt(x)).join(' | ')} |`);
        }
    }
    const report = lines.join('\n') + '\n';
    const target = args('out')[0];
    if (target) fs.writeFileSync(target, report);
    process.stdout.write(report);
}

void main();
