/**
 * Matched-seed validation of the engineer score and the fit of its weights. Reads crew training
 * runs made with `npm run train` on the same seeds, one crew per engineer policy (crews
 * `engineer-<policy>.json`), and prints a markdown report: the fitted weights, paired gaps between
 * policies with 95% bootstrap intervals, gaps by risk tercile, held-out seeds and scenarios, and how
 * well K predicts the next 60-120 s.
 *
 *   npm --prefix modules/ai run score:engineer -- --runs <train out dir> [--runs <dir> ...] [--out report.md]
 *
 * Each run's weight-free components are cached beside its recording as `<run>.ekpi.json`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { EngineerComponents, EngineerWeights, components, engineerKpi, observe } from './engineer-kpi';
import { readEvents, readFrames } from './recording';

import { integrity } from './features';

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

/** One frame of a run: K's components and what happened next. */
interface Frame extends EngineerComponents {
    /** 1 target dead by t+h, minus the player's integrity lost by t+h; null when the run ends first. */
    readonly outcome60: number | null;
    readonly outcome120: number | null;
}

interface Run {
    readonly scenario: string;
    readonly seed: number;
    readonly policy: PolicyName;
    readonly frames: readonly Frame[];
    readonly killed: boolean;
}

function args(name: string) {
    return process.argv.flatMap((a, i) => (a === `--${name}` ? [process.argv[i + 1]] : []));
}

async function loadRun(sgr: string): Promise<Frame[]> {
    const cache = sgr.replace(/\.sgr$/, '.ekpi.json');
    if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8')) as Frame[];
    const frames = await readFrames(sgr);
    const seen = frames.flatMap((f) => {
        const o = observe(f.t, f.saved, PLAYER);
        if (!o) return [];
        const target = [...f.saved.fragment.space.getAll('Spaceship')].find((s) => s.id !== PLAYER && !s.destroyed);
        const ship = f.saved.fragment.ship.get(PLAYER)!;
        return [{ o, alive: !!target, integrity: integrity(ship) }];
    });
    const cs = components(
        seen.map((s) => s.o),
        readEvents(sgr),
        PLAYER,
    );
    const end = frames.at(-1)?.t ?? 0;
    const lost = seen.length < frames.length;
    const outcome = (i: number, h: number) => {
        const t = cs[i].t;
        const later = seen.findIndex((s, j) => j > i && !s.alive);
        if (later >= 0 && cs[later].t <= t + h) return 1 - (seen[i].integrity - seen[later].integrity);
        if (end < t + h) return lost ? -seen[i].integrity : null;
        const at = seen.findLastIndex((_, j) => cs[j].t <= t + h);
        return -(seen[i].integrity - seen[at].integrity);
    };
    const out = cs.map((c, i) => ({ ...c, outcome60: outcome(i, 60), outcome120: outcome(i, 120) }));
    fs.writeFileSync(cache, JSON.stringify(out));
    return out;
}

async function loadRuns(dirs: readonly string[]) {
    const runs: Run[] = [];
    for (const dir of dirs) {
        for (const crew of fs.readdirSync(dir)) {
            const policy = crew.replace(/^engineer-/, '') as PolicyName;
            if (!crew.startsWith('engineer-') || !POLICIES.includes(policy)) continue;
            for (const file of fs.readdirSync(path.join(dir, crew)).filter((f) => f.endsWith('.sgr'))) {
                const [, scenario, seed] = /^(.+)_seed(\d+)\.sgr$/.exec(file) ?? [];
                if (!scenario) continue;
                const frames = await loadRun(path.join(dir, crew, file));
                const report = path.join(dir, `${scenario}-crews.json`);
                const killed = fs.existsSync(report)
                    ? (
                          JSON.parse(fs.readFileSync(report, 'utf8')) as {
                              crew: string;
                              seed: number;
                              killed: boolean;
                          }[]
                      ).some((r) => r.crew === crew && r.seed === Number(seed) && r.killed)
                    : false;
                runs.push({ scenario, seed: Number(seed), policy, frames, killed });
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

/** Mean of `deltas` and its 95% percentile bootstrap interval. */
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

/** Run-level score: mean K over the run's frames, optionally only those whose risk passes `keep`. */
function runScore(run: Run, w: EngineerWeights, keep: (f: Frame) => boolean = () => true) {
    return mean(run.frames.filter(keep).map((f) => engineerKpi(f, w)));
}

/** Per (scenario, seed) paired deltas of `a` minus `b`. */
function paired(
    runs: readonly Run[],
    a: PolicyName,
    b: PolicyName,
    w: EngineerWeights,
    keep?: (f: Frame) => boolean,
): number[] {
    const by = new Map(runs.map((r) => [`${r.scenario}/${r.seed}/${r.policy}`, r]));
    const deltas: number[] = [];
    for (const r of runs.filter((x) => x.policy === a)) {
        const other = by.get(`${r.scenario}/${r.seed}/${b}`);
        if (!other) continue;
        const d = runScore(r, w, keep) - runScore(other, w, keep);
        if (Number.isFinite(d)) deltas.push(d);
    }
    return deltas;
}

/** Risk tercile cut points, pooled over every frame. */
function terciles(runs: readonly Run[]) {
    const risks = runs.flatMap((r) => r.frames.map((f) => f.risk)).sort((a, c) => a - c);
    return [risks[Math.floor(risks.length / 3)], risks[Math.floor((2 * risks.length) / 3)]] as const;
}

const tercileOf = (cuts: readonly [number, number]) => (k: 0 | 1 | 2) => (f: Frame) =>
    k === 0 ? f.risk < cuts[0] : k === 1 ? f.risk >= cuts[0] && f.risk < cuts[1] : f.risk >= cuts[1];

/** The required orderings, as paired contrasts that must be positive. */
function contrasts(runs: readonly Run[], w: EngineerWeights, cuts: readonly [number, number]) {
    const high = tercileOf(cuts)(2);
    return {
        'reference − idle': paired(runs, 'reference', 'idle', w),
        'idle − all-shutdown': paired(runs, 'idle', 'all-shutdown', w),
        'reference − all-max (high risk)': paired(runs, 'reference', 'all-max', w, high),
    };
}

/** Standardised paired gap: mean / sd, the paired t without the sqrt(n). */
function effect(deltas: readonly number[]) {
    const m = mean(deltas);
    const sd = Math.sqrt(mean(deltas.map((d) => (d - m) ** 2))) || 1e-9;
    return m / sd;
}

/**
 * Within-tercile Pearson correlation of frame K with the outcome h seconds on, averaged over terciles
 * (and so conditional on the situation's risk).
 */
function predictive(runs: readonly Run[], w: EngineerWeights, cuts: readonly [number, number], h: 60 | 120) {
    const corr: number[] = [];
    for (const k of [0, 1, 2] as const) {
        const keep = tercileOf(cuts)(k);
        const pairs = runs.flatMap((r) =>
            r.frames.flatMap((f) => {
                const y = h === 60 ? f.outcome60 : f.outcome120;
                return keep(f) && y !== null ? [[engineerKpi(f, w), y] as const] : [];
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

function grid(): EngineerWeights[] {
    const out: EngineerWeights[] = [];
    for (const k of [0.5, 1, 2, 4])
        for (const n0 of [0.25, 0.5, 1])
            for (const beta of [0, 1, 3])
                for (const lambda0 of [0, 0.1, 0.2, 0.3])
                    for (const lambda1 of [0, 0.2, 0.4])
                        for (const epsilon of [0.01, 0.05, 0.2]) out.push({ k, n0, beta, lambda0, lambda1, epsilon });
    return out;
}

/** The weights maximising the weakest required contrast, among those whose K predicts the 120 s outcome. */
function fit(runs: readonly Run[]) {
    const cuts = terciles(runs);
    let best: { w: EngineerWeights; score: number } | undefined;
    for (const w of grid()) {
        if (predictive(runs, w, cuts, 120).mean <= 0) continue;
        const score = Math.min(...Object.values(contrasts(runs, w, cuts)).map(effect));
        if (!best || score > best.score) best = { w, score };
    }
    return best;
}

const fmt = (x: number, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const ci = (b: ReturnType<typeof bootstrap>) =>
    `${fmt(b.mean)} [${fmt(b.lo)}, ${fmt(b.hi)}] n=${b.n}${b.lo > 0 ? ' ✓' : b.hi < 0 ? ' ✗' : ''}`;

async function main() {
    const runs = await loadRuns(args('runs').map((d) => path.resolve(d)));
    const scenarios = [...new Set(runs.map((r) => r.scenario))].sort();
    const seeds = [...new Set(runs.map((r) => r.seed))].sort((a, c) => a - c);
    const trainSeeds = new Set(seeds.slice(0, Math.ceil((2 * seeds.length) / 3)));
    const train = runs.filter((r) => trainSeeds.has(r.seed));
    const test = runs.filter((r) => !trainSeeds.has(r.seed));
    const lines: string[] = [];
    const out = (s = '') => lines.push(s);

    const fitted = fit(train);
    if (!fitted) throw new Error('no weights satisfy the predictive constraint');
    const w = fitted.w;
    out(`runs ${runs.length}; scenarios ${scenarios.join(', ')}; seeds ${seeds.join(',')}`);
    out(`fit seeds ${[...trainSeeds].join(',')}; held-out seeds ${seeds.filter((s) => !trainSeeds.has(s)).join(',')}`);
    out();
    out(`fitted weights: \`${JSON.stringify(w)}\` (weakest standardised train contrast ${fmt(fitted.score)})`);
    out();

    const cuts = terciles(runs);
    out(`risk tercile cuts (all frames): ${fmt(cuts[0])}, ${fmt(cuts[1])}`);
    out();
    out('### Mean run K by policy (all seeds)');
    out();
    out(`| scenario | ${POLICIES.join(' | ')} |`);
    out(`| --- |${POLICIES.map(() => ' --- |').join('')}`);
    for (const s of [...scenarios, 'all']) {
        const sub = runs.filter((r) => s === 'all' || r.scenario === s);
        out(
            `| ${s} | ${POLICIES.map((p) => fmt(mean(sub.filter((r) => r.policy === p).map((r) => runScore(r, w))))).join(' | ')} |`,
        );
    }
    out();
    out('### Kills by policy');
    out();
    out(`| scenario | ${POLICIES.join(' | ')} |`);
    out(`| --- |${POLICIES.map(() => ' --- |').join('')}`);
    for (const s of scenarios) {
        const sub = runs.filter((r) => r.scenario === s);
        out(
            `| ${s} | ${POLICIES.map((p) => {
                const rs = sub.filter((r) => r.policy === p);
                return `${rs.filter((r) => r.killed).length}/${rs.length}`;
            }).join(' | ')} |`,
        );
    }
    out();
    const contrastTable = (title: string, subset: readonly Run[]) => {
        out(`### ${title}`);
        out();
        out('Paired Δ mean run K, 95% bootstrap CI over (scenario, seed) pairs. ✓ CI above 0, ✗ below.');
        out();
        const pairs: [PolicyName, PolicyName][] = [
            ['reference', 'idle'],
            ['idle', 'all-shutdown'],
            ['reference', 'all-shutdown'],
            ['reference', 'all-max'],
            ['reference', 'random'],
            ['reference', 'never-jump-start'],
            ['reference-repairing', 'reference'],
        ];
        out(`| scenario | ${pairs.map(([a, b]) => `${a} − ${b}`).join(' | ')} |`);
        out(`| --- |${pairs.map(() => ' --- |').join('')}`);
        for (const s of [...scenarios, 'all']) {
            const sub = subset.filter((r) => s === 'all' || r.scenario === s);
            out(`| ${s} | ${pairs.map(([a, b]) => ci(bootstrap(paired(sub, a, b, w)))).join(' | ')} |`);
        }
        out();
        out('By risk tercile (frames of each run within the tercile):');
        out();
        out('| scenario | tercile | reference − idle | reference − all-max | idle − all-shutdown |');
        out('| --- | --- | --- | --- | --- |');
        for (const s of [...scenarios, 'all']) {
            const sub = subset.filter((r) => s === 'all' || r.scenario === s);
            for (const k of [0, 1, 2] as const) {
                const keep = tercileOf(cuts)(k);
                out(
                    `| ${s} | ${['low', 'mid', 'high'][k]} | ${ci(bootstrap(paired(sub, 'reference', 'idle', w, keep)))} | ${ci(
                        bootstrap(paired(sub, 'reference', 'all-max', w, keep)),
                    )} | ${ci(bootstrap(paired(sub, 'idle', 'all-shutdown', w, keep)))} |`,
                );
            }
        }
        out();
    };
    contrastTable('All seeds', runs);
    contrastTable('Held-out seeds', test);

    out('### Held-out scenario (fit on the other scenarios, all seeds)');
    out();
    out('| held out | weights | reference − idle | idle − all-shutdown | reference − all-max (high risk) |');
    out('| --- | --- | --- | --- | --- |');
    for (const s of scenarios) {
        const f = fit(runs.filter((r) => r.scenario !== s));
        const held = runs.filter((r) => r.scenario === s);
        if (!f) {
            out(`| ${s} | none | | | |`);
            continue;
        }
        const c = contrasts(held, f.w, cuts);
        out(
            `| ${s} | \`${JSON.stringify(f.w)}\` | ${Object.values(c)
                .map((d) => ci(bootstrap(d)))
                .join(' | ')} |`,
        );
    }
    out();
    out('### Predictive validity');
    out();
    out(
        'Within-risk-tercile Pearson r of frame K with the outcome (1 if the target dies by t+h, minus own integrity lost by t+h).',
    );
    out();
    out('| set | h | mean r | low | mid | high |');
    out('| --- | --- | --- | --- | --- | --- |');
    for (const [name, set] of [
        ['fit seeds', train],
        ['held-out seeds', test],
    ] as const) {
        for (const h of [60, 120] as const) {
            const p = predictive(set, w, cuts, h);
            out(`| ${name} | ${h} | ${fmt(p.mean)} | ${p.byTercile.map((x) => fmt(x)).join(' | ')} |`);
        }
    }
    const report = lines.join('\n') + '\n';
    const target = args('out')[0];
    if (target) fs.writeFileSync(target, report);
    process.stdout.write(report);
}

void main();
