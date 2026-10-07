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
 * as `<run>.ekpi5.json`.
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
import { RankedPair, bootstrap, ci, fmt, mean, rankingValidity, seedCorr as pointsCorr } from './validate-stats';
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

/**
 * One frame: K's components, whether the opponent is still alive, and the hostiles' mean integrity (the
 * ships hostile to the player in the first frame; 0 once one is destroyed or gone).
 */
type Frame = EngineerComponents & { readonly targetAlive: boolean; readonly hostile: number };

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
    /** Hostile integrity dealt over (t, t+h] minus own integrity lost; null when the run ends first otherwise. */
    readonly graded60: (number | null)[];
    readonly graded120: (number | null)[];
}

function args(name: string) {
    return process.argv.flatMap((a, i) => (a === `--${name}` ? [process.argv[i + 1]] : []));
}

async function loadRun(sgr: string): Promise<{ frames: Frame[]; end: number; lost: boolean }> {
    const cache = sgr.replace(/\.sgr$/, '.ekpi5.json');
    if (fs.existsSync(cache))
        return JSON.parse(fs.readFileSync(cache, 'utf8')) as { frames: Frame[]; end: number; lost: boolean };
    const recorded = await readFrames(sgr);
    const first = recorded[0]?.saved.fragment.space;
    const faction = first?.getShip(PLAYER)?.faction;
    const hostiles = first ? [...first.getAll('Spaceship')].filter((s) => s.faction !== faction).map((s) => s.id) : [];
    const seen = recorded.flatMap((f) => {
        const o = observe(f.t, f.saved, PLAYER);
        if (!o) return [];
        const alive = [...f.saved.fragment.space.getAll('Spaceship')].some((s) => s.id !== PLAYER && !s.destroyed);
        const hostile = hostiles.length
            ? hostiles.reduce((sum, id) => {
                  const ship = f.saved.fragment.ship.get(id);
                  const body = f.saved.fragment.space.getShip(id);
                  return sum + (ship && body && !body.destroyed ? integrity(ship) : 0);
              }, 0) / hostiles.length
            : 0;
        return [{ o, alive, hostile }];
    });
    const cs = components(
        seen.map((s) => s.o),
        readEvents(sgr),
        PLAYER,
    );
    const run = {
        frames: cs.map((c, i) => ({ ...c, targetAlive: seen[i].alive, hostile: seen[i].hostile })),
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
        if (killed >= 0)
            return { kill: 1, loss: f[i].integrity - f[killed].integrity, dealt: f[i].hostile - f[killed].hostile };
        if (run.end < t + h) return run.lost ? { kill: 0, loss: f[i].integrity, dealt: 0 } : null;
        const last = f.findLastIndex((x) => x.t <= t + h);
        return { kill: 0, loss: f[i].integrity - f[last].integrity, dealt: f[i].hostile - f[last].hostile };
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
        graded60: f.map((_, i) => {
            const o = at(i, 60);
            return o ? o.dealt - o.loss : null;
        }),
        graded120: f.map((_, i) => {
            const o = at(i, 120);
            return o ? o.dealt - o.loss : null;
        }),
    };
}

type LoadedRun = Run & { lost: boolean; killed: boolean; outcomes: Outcomes };

const crewReports = new Map<string, { crew: string; seed: number; killed: boolean }[]>();

/** The run results `npm run train` wrote beside a scenario's recordings. */
function crewResults(dir: string, scenario: string) {
    const file = path.join(dir, `${scenario}-crews.json`);
    let results = crewReports.get(file);
    if (!results) {
        results = fs.existsSync(file)
            ? (JSON.parse(fs.readFileSync(file, 'utf8')) as { crew: string; seed: number; killed: boolean }[])
            : [];
        crewReports.set(file, results);
    }
    return results;
}

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
                const result = crewResults(dir, scenario).find((r) => r.crew === crew && r.seed === Number(seed));
                const run = { scenario, seed: Number(seed), policy, ...loaded, killed: !!result?.killed };
                runs.push({ ...run, outcomes: outcomesOf(run) });
                process.stderr.write('.');
            }
        }
    }
    process.stderr.write('\n');
    return runs;
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

/**
 * Per (scenario, seed) paired outcome deltas of `a` minus `b`, positive better for `a`: the kill (1/0),
 * seconds saved to the run's end (the kill, or the timeout for both), and damage rate: own integrity lost
 * per second a hostile was within twice its gun range of us, over the pair's common time (lower for `a`
 * is positive). With the KPI delta of the same pair.
 */
/** Below this own integrity a run counts as no longer surviving (the GVTS is non-expendable). */
const SURVIVAL_INTEGRITY = 0.5;

/**
 * Scenarios whose fights almost never end in a kill: gated on damage per exposure second instead. Survival
 * is reported but does not gate, since a ship that does not fight is shot less.
 */
const RATE_GATED = /^E1-/;

function pairedOutcomes(runs: readonly Scored[], a: PolicyName, b: PolicyName) {
    const by = new Map(runs.map((r) => [`${r.scenario}/${r.seed}/${r.policy}`, r]));
    const rows: {
        kpi: number;
        kill: number;
        saved: number;
        survived: number;
        damageRate: number;
        lost: number;
        graded: number;
    }[] = [];
    for (const x of runs.filter((r) => r.policy === a)) {
        const y = by.get(`${x.scenario}/${x.seed}/${b}`);
        if (!y || !x.frames.length || !y.frames.length) continue;
        const until = Math.min(x.end, y.end);
        const rate = (r: Scored) => {
            const within = r.frames.filter((f) => f.t <= until);
            const exposed = within.filter((f) => f.features.threats > 0).length;
            const lost = r.frames[0].integrity - (within.at(-1) ?? r.frames[0]).integrity;
            return exposed ? lost / exposed : 0;
        };
        const ownLoss = (r: Scored) =>
            r.frames[0].integrity - (r.frames.filter((f) => f.t <= until).at(-1) ?? r.frames[0]).integrity;
        const gradedOf = (r: Scored) => {
            const last = r.frames.filter((f) => f.t <= until).at(-1) ?? r.frames[0];
            return r.frames[0].hostile - last.hostile - (r.frames[0].integrity - last.integrity);
        };
        const avg = (r: Scored) => mean(r.k.filter((_, i) => r.frames[i].t <= until));
        /** Seconds until own integrity fell below half, or the pair's common end. */
        const survival = (r: Scored) =>
            r.frames.find((f) => f.t <= until && f.integrity < SURVIVAL_INTEGRITY)?.t ?? until;
        rows.push({
            kpi: avg(x) - avg(y),
            kill: Number(x.killed) - Number(y.killed),
            saved: y.end - x.end,
            survived: survival(x) - survival(y),
            damageRate: rate(y) - rate(x),
            lost: ownLoss(y) - ownLoss(x),
            graded: gradedOf(x) - gradedOf(y),
        });
    }
    return rows;
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

/**
 * Own integrity lost per second a hostile is in range over (t, t+h], negated so higher is better; null
 * when the run ends first. The outcome of rate-gated rungs, where kills almost never happen.
 */
function rateOutcome(r: Scored, i: number, h: number) {
    const f = r.frames;
    let j = i;
    while (j < f.length - 1 && f[j + 1].t <= f[i].t + h + 1e-6) j++;
    if (f[j].t < f[i].t + h - 1e-6) return null;
    const exposed = f.slice(i + 1, j + 1).filter((x) => x.features.threats > 0).length;
    return exposed ? -(f[i].integrity - f[j].integrity) / exposed : 0;
}

/**
 * Within-tercile Pearson r of frame K with the h-second outcome, averaged over terciles. The outcome is
 * the run outcome (kill minus own integrity lost), or on rate-gated rungs the damage rate, matching the
 * outcome gates.
 */
function predictive(runs: readonly Scored[], cuts: readonly [number, number], h: 60 | 120) {
    const corr: number[] = [];
    for (const k of [0, 1, 2] as const) {
        const keep = tercile(cuts, k);
        const pairs = runs.flatMap((r) =>
            r.k.flatMap((x, i) => {
                const y = RATE_GATED.test(r.scenario)
                    ? rateOutcome(r, i, h)
                    : (h === 60 ? r.outcomes.outcome60 : r.outcomes.outcome120)[i];
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
 * Outcome of frame `i` over (t, t+h] for the predictive check: the gate's outcome (`gate`), own integrity
 * lost (`raw`), or hostile integrity dealt minus own integrity lost (`graded`).
 */
function outcomeAt(r: Scored, i: number, h: 60 | 120, mode: 'gate' | 'raw' | 'graded' = 'gate') {
    if (mode === 'graded') return (h === 60 ? r.outcomes.graded60 : r.outcomes.graded120)[i];
    if (mode === 'raw') {
        const f = r.frames;
        let j = i;
        while (j < f.length - 1 && f[j + 1].t <= f[i].t + h + 1e-6) j++;
        return f[j].t < f[i].t + h - 1e-6 ? null : -(f[i].integrity - f[j].integrity);
    }
    return RATE_GATED.test(r.scenario)
        ? rateOutcome(r, i, h)
        : (h === 60 ? r.outcomes.outcome60 : r.outcomes.outcome120)[i];
}

interface Moment {
    readonly scenario: string;
    readonly seed: number;
    readonly k: number;
    readonly r: number;
    readonly y: number;
}

/**
 * Frames with K and the outcome both measured against the other policies at the same moment: the K and
 * the outcome of a frame minus their means over the policies of the same scenario and seed at the same
 * second. Every policy faces the same opponent, so what is left is what the engineer's choices changed;
 * the stretch of the fight (store drains, damage lands later) is removed. Moments with fewer than three
 * policies are dropped.
 */
function moments(runs: readonly Scored[], h: 60 | 120, mode: 'gate' | 'raw' | 'graded' = 'gate'): Moment[] {
    const groups = new Map<string, { run: Scored; i: number; y: number }[]>();
    for (const run of runs) {
        run.frames.forEach((f, i) => {
            const y = outcomeAt(run, i, h, mode);
            if (y === null) return;
            const key = `${run.scenario}/${run.seed}/${Math.round(f.t)}`;
            const g = groups.get(key);
            if (g) g.push({ run, i, y });
            else groups.set(key, [{ run, i, y }]);
        });
    }
    const out: Moment[] = [];
    for (const g of groups.values()) {
        if (g.length < 3) continue;
        const mk = mean(g.map((x) => x.run.k[x.i]));
        const my = mean(g.map((x) => x.y));
        for (const x of g)
            out.push({
                scenario: x.run.scenario,
                seed: x.run.seed,
                k: x.run.k[x.i] - mk,
                r: x.run.r[x.i],
                y: x.y - my,
            });
    }
    return out;
}

/**
 * The reserve is set by design: `λ0` 0.3, `λ1` 0.4, and the store the engineer should hold rising from
 * 0.25 at no risk to 0.5 at full risk (`N0` 0.25, `β` 1) with `k = ln 10`, so holding that store earns
 * R = 0.9. Only `ε` is fitted. `--free-reserve` also fits the reserve weights, for reference.
 */
const FREE_RESERVE = process.argv.includes('--free-reserve');
/** ε is 0: a system nobody asks anything of does not score. `--epsilon <x ...>` fits it over the given values instead. */
const EPSILONS = args('epsilon').length ? args('epsilon').map(Number) : [0];

function grid(): EngineerWeights[] {
    const out: EngineerWeights[] = [];
    const reserve = FREE_RESERVE
        ? [0.5, 1, 2, 4].flatMap((k) =>
              [0.25, 0.5, 1].flatMap((n0) =>
                  [0, 1, 3].flatMap((beta) =>
                      [0, 0.1, 0.2, 0.3].flatMap((lambda0) =>
                          [0, 0.2, 0.4].map((lambda1) => ({ k, n0, beta, lambda0, lambda1 })),
                      ),
                  ),
              ),
          )
        : [{ k: Math.LN10, n0: 0.25, beta: 1, lambda0: 0.3, lambda1: 0.4 }];
    for (const r of reserve) for (const epsilon of EPSILONS) out.push({ ...r, epsilon });
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

/** Below this graded-outcome gap two policies count as tied and the pair is not scored. */
const TIE = 0.02;

/**
 * Every pair of policies on one scenario and seed, over the pair's common time: the K gap and the gap in
 * the graded outcome (hostile integrity dealt minus own integrity lost). Pairs whose outcome gap is below
 * {@link TIE} are dropped.
 */
function rankedPairs(runs: readonly Scored[]): Map<string, RankedPair[]> {
    const by = new Map<string, Scored[]>();
    for (const r of runs) by.set(`${r.scenario}/${r.seed}`, [...(by.get(`${r.scenario}/${r.seed}`) ?? []), r]);
    const out = new Map<string, RankedPair[]>();
    for (const [key, group] of by) {
        const scenario = key.split('/')[0];
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const [x, y] = [group[i], group[j]];
                const until = Math.min(x.end, y.end);
                const view = (r: Scored) => {
                    const within = r.frames.filter((f) => f.t <= until);
                    const last = within.at(-1) ?? r.frames[0];
                    return {
                        k: mean(r.k.filter((_, n) => r.frames[n].t <= until)),
                        graded: r.frames[0].hostile - last.hostile - (r.frames[0].integrity - last.integrity),
                    };
                };
                const [vx, vy] = [view(x), view(y)];
                const graded = vx.graded - vy.graded;
                if (!Number.isFinite(vx.k - vy.k) || Math.abs(graded) < TIE) continue;
                out.set(scenario, [...(out.get(scenario) ?? []), { seed: x.seed, x: vx.k - vy.k, y: graded }]);
            }
        }
    }
    return out;
}

/** Reliability of the risk curve against `hurt30` over `runs`: 10 equal-count bins, ECE and Brier skill against `baseRate`. */
function calibration(runs: readonly LoadedRun[], model: RiskModel, baseRate: number) {
    const pts = runs.flatMap((run) =>
        run.frames.flatMap((f, i) => {
            const y = run.outcomes.hurt30[i];
            return y === null ? [] : [{ p: riskOf(f.features, model), y }];
        }),
    );
    pts.sort((a, c) => a.p - c.p);
    const bins = Array.from({ length: 10 }, (_, b) =>
        pts.slice(Math.floor((b * pts.length) / 10), Math.floor(((b + 1) * pts.length) / 10)),
    );
    const rows = bins.map((b) => ({ n: b.length, p: mean(b.map((x) => x.p)), y: mean(b.map((x) => x.y)) }));
    const brier = mean(pts.map((x) => (x.p - x.y) ** 2));
    const brierBase = mean(pts.map((x) => (baseRate - x.y) ** 2));
    return {
        n: pts.length,
        rows,
        ece: pts.length ? rows.reduce((sum, r) => sum + (r.n / pts.length) * Math.abs(r.p - r.y), 0) : NaN,
        brier,
        skill: 1 - brier / brierBase,
    };
}

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

    out('### Energy held (store share without cells)');
    out();
    out(`| scenario | ${POLICIES.join(' | ')} |`);
    out(`| --- |${POLICIES.map(() => ' --- |').join('')}`);
    for (const s of scenarios) {
        const cell = (p: PolicyName) =>
            fmt(
                mean(
                    all.filter((r) => r.scenario === s && r.policy === p).flatMap((r) => r.frames.map((f) => f.store)),
                ),
                2,
            );
        out(`| ${s} | ${POLICIES.map(cell).join(' | ')} |`);
    }
    out();
    out('### KPI against outcome');
    out();
    out(
        'Per pair of runs on one seed, positive = first policy better: KPI Δ; kill Δ (1/0); seconds saved to the end of the run (kill or timeout); damage-rate Δ (own integrity lost per second a hostile was within twice its gun range, lower better); integrity lost Δ (own integrity lost over the common time, lower better; reported, not gated); graded Δ (hostile integrity dealt minus own integrity lost over the common time, positive better for the first policy; reported, not gated). 95% bootstrap CIs. Outcomes separate the pair when the kill or seconds-saved CI excludes 0 (E1 rungs, which almost never end in a kill: damage rate; survival — seconds until own integrity < 0.5 — is reported only); elsewhere the KPI ordering is informational. Agreement: seeds where the KPI Δ has the sign of the kill Δ, or of seconds saved when kills tie.',
    );
    out();
    out(
        '| scenario | contrast | KPI Δ | kill Δ | seconds saved | survival Δ (s) | damage-rate Δ | integrity lost Δ | graded Δ | gated on | outcome separates | agreement |',
    );
    out('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const s of [...scenarios, 'all']) {
        const sub = all.filter((r) => s === 'all' || r.scenario === s);
        for (const [a, b] of [
            ['reference', 'idle'],
            ['idle', 'all-shutdown'],
            ['reference', 'all-max'],
            ['reference', 'random'],
            ['reference', 'never-jump-start'],
            ['reference-repairing', 'reference'],
        ] as const) {
            const rows = pairedOutcomes(sub, a, b);
            const kill = bootstrap(rows.map((r) => r.kill));
            const saved = bootstrap(rows.map((r) => r.saved));
            const survived = bootstrap(rows.map((r) => r.survived));
            const rate = bootstrap(rows.map((r) => r.damageRate));
            const lost = bootstrap(rows.map((r) => r.lost));
            const graded = bootstrap(rows.map((r) => r.graded));
            const byRate = RATE_GATED.test(s);
            const [g1, g2] = byRate ? [rate, rate] : [kill, saved];
            const outcome = (r: (typeof rows)[number]) =>
                byRate ? Math.sign(r.damageRate) : r.kill !== 0 ? Math.sign(r.kill) : Math.sign(Math.round(r.saved));
            const decided = rows.filter((r) => outcome(r) !== 0);
            const agree = decided.filter((r) => Math.sign(r.kpi) === outcome(r)).length;
            const separates = g1.lo > 0 || g2.lo > 0 ? `${a} better` : g1.hi < 0 || g2.hi < 0 ? `${b} better` : 'no';
            out(
                `| ${s} | ${a} − ${b} | ${ci(bootstrap(rows.map((r) => r.kpi)))} | ${ci(kill)} | ${ci(saved)} | ${ci(survived)} | ${ci(rate)} | ${ci(lost)} | ${ci(graded)} | ${byRate ? 'damage rate' : 'kill, seconds saved'} | ${separates} | ${decided.length ? `${agree}/${decided.length}` : '–'} |`,
            );
        }
    }
    out();
    out('### Repairs: reference-repairing − reference where there is damage to fix');
    out();
    out(
        'Seeds whose reference run took a defect; KPI Δ and demanded damage backlog Δ (Σa·sev, lower is better) over their common time.',
    );
    out();
    out('| scenario | seeds with damage | KPI Δ | backlog Δ |');
    out('| --- | --- | --- | --- |');
    for (const s of [...scenarios, 'all']) {
        const sub = all.filter((r) => s === 'all' || r.scenario === s);
        const by = new Map(sub.map((r) => [`${r.scenario}/${r.seed}/${r.policy}`, r]));
        const kpi: number[] = [];
        const backlog: number[] = [];
        for (const x of sub.filter((r) => r.policy === 'reference' && r.frames.some((f) => f.sumSev > 0))) {
            const y = by.get(`${x.scenario}/${x.seed}/reference-repairing`);
            if (!y) continue;
            const until = Math.min(x.end, y.end);
            const avg = (r: Scored, v: (i: number) => number) =>
                mean(r.frames.flatMap((f, i) => (f.t <= until ? [v(i)] : [])));
            kpi.push(avg(y, (i) => y.k[i]) - avg(x, (i) => x.k[i]));
            backlog.push(avg(y, (i) => y.frames[i].sumAsev) - avg(x, (i) => x.frames[i].sumAsev));
        }
        out(`| ${s} | ${kpi.length} | ${ci(bootstrap(kpi))} | ${ci(bootstrap(backlog))} |`);
    }
    out();

    const fitRuns = runs.filter((r) => trainSeeds.has(r.seed));
    out('### Leave one scenario out');
    out();
    out(
        'The risk curve and weights are fit on the other scenarios fit seeds only. "held" scores the held scenario on its held-out seeds: neither the scenario nor the seed was seen. "all" scores every seed of the held scenario.',
    );
    out();
    out(
        '| held out | seeds | reference − idle | idle − all-shutdown | reference − all-max | reference − all-max (high risk) | risk Brier skill | risk ECE |',
    );
    out('| --- | --- | --- | --- | --- | --- | --- | --- |');
    const baseRate = (rs: readonly LoadedRun[]) =>
        mean(rs.flatMap((r) => r.outcomes.hurt30.filter((y): y is number => y !== null)));
    for (const s of scenarios) {
        const f = fit(fitRuns.filter((r) => r.scenario !== s));
        if (!f) continue;
        const c = terciles(score(runs, f.w, f.risk));
        for (const [label, seedsOf] of [
            ['held', (r: LoadedRun) => !trainSeeds.has(r.seed)],
            ['all', () => true],
        ] as const) {
            const heldRuns = runs.filter((r) => r.scenario === s && seedsOf(r));
            const held = score(heldRuns, f.w, f.risk);
            const cal = calibration(heldRuns, f.risk, baseRate(fitRuns.filter((r) => r.scenario !== s)));
            out(
                `| ${s} | ${label} | ${ci(bootstrap(paired(held, 'reference', 'idle')))} | ${ci(bootstrap(paired(held, 'idle', 'all-shutdown')))} | ${ci(bootstrap(paired(held, 'reference', 'all-max')))} | ${ci(bootstrap(paired(held, 'reference', 'all-max', tercile(c, 2))))} | ${fmt(cal.skill)} | ${fmt(cal.ece)} |`,
            );
        }
    }
    out();
    out('### Risk curve calibration');
    out();
    out(
        `The risk curve is a probability of own integrity loss >= 0.02 in 30 s. Fit seeds base rate ${fmt(baseRate(fitRuns))}. Equal-count bins over the held-out seeds (predicted mean to observed rate); Brier skill is 1 - Brier / Brier of the constant base rate (positive: better than the constant).`,
    );
    out();
    out('| scenario | Brier skill | ECE | n | bins (predicted to observed) |');
    out('| --- | --- | --- | --- | --- |');
    const heldAll = runs.filter((r) => !trainSeeds.has(r.seed));
    for (const s of [...scenarios, 'all']) {
        const cal = calibration(
            heldAll.filter((r) => s === 'all' || r.scenario === s),
            fitted.risk,
            baseRate(fitRuns),
        );
        out(
            `| ${s} | ${fmt(cal.skill)} | ${fmt(cal.ece)} | ${cal.n} | ${cal.rows.map((b) => `${fmt(b.p, 2)}to${fmt(b.y, 2)}`).join(' ')} |`,
        );
    }
    out();
    out('### Policy-ranking validity');
    out();
    out(
        `Every pair of the seven policies on one scenario and seed, over the pair's common time: the K gap against the gap in the graded outcome (hostile integrity dealt minus own integrity lost; a kill counts 1). Pairs whose outcome gap is below ${TIE} are dropped. Spearman r over pairs, 95% CI over seeds; sign = share of pairs whose K gap has the sign of the outcome gap. This is the check that K ranks engineers the way the game does, including idle against all-shutdown and reference against all-max on every scenario.`,
    );
    out();
    out('| set | scenario | pairs | Spearman r [CI] | sign |');
    out('| --- | --- | --- | --- | --- |');
    for (const [name, set] of [
        ['fit seeds', all.filter((r) => trainSeeds.has(r.seed))],
        ['held-out seeds', test],
    ] as const) {
        const pairsBy = rankedPairs(set);
        for (const sc of [...scenarios, 'all']) {
            const v = rankingValidity(sc === 'all' ? [...pairsBy.values()].flat() : (pairsBy.get(sc) ?? []));
            out(`| ${name} | ${sc} | ${v.n} | ${fmt(v.r, 2)} [${fmt(v.lo, 2)}, ${fmt(v.hi, 2)}] | ${fmt(v.sign, 2)} |`);
        }
    }
    out();
    out('### Predictive validity');
    out();
    out(
        'Frame K against the outcome over the next h seconds: the opponent dies (1/0) minus own integrity lost; on E1 rungs minus own integrity lost per second a hostile was in range. Pearson r within each risk tercile; the mean of the three.',
    );
    out();
    out(
        '**Pooled (legacy)**: every frame of every scenario in one correlation. It mixes the outcome scales of the scenarios and the stretch of each fight (the store drains while damage lands later), so it can be near 0 or positive while K is negatively related to the outcome inside a scenario.',
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
    out();
    out(
        '**Within-moment** (h = 120): K and the outcome of every frame minus their means over the policies of the same scenario and seed at the same second (at least three policies). Every policy faces the same opponent, so what is left is what the choices of the engineer changed. r [95% CI over seeds] per risk tercile; mean of the terciles that have data. Outcome rows: gate (as above), raw (E1 rungs: minus own integrity lost, not per exposure second) and graded (every scenario: hostile integrity dealt minus own integrity lost).',
    );
    out();
    out('| set | scenario | low | mid | high | mean |');
    out('| --- | --- | --- | --- | --- | --- |');
    const rc = (x: ReturnType<typeof pointsCorr>) =>
        Number.isFinite(x.r) ? `${fmt(x.r, 2)} [${fmt(x.lo, 2)}, ${fmt(x.hi, 2)}]` : '–';
    for (const [name, set] of [
        ['fit seeds', all.filter((r) => trainSeeds.has(r.seed))],
        ['held-out seeds', test],
    ] as const) {
        for (const mode of ['gate', 'raw', 'graded'] as const) {
            const ms = moments(set, 120, mode);
            for (const sc of mode === 'raw' ? scenarios.filter((x) => RATE_GATED.test(x)) : [...scenarios, 'all']) {
                const sub = ms.filter((m) => sc === 'all' || m.scenario === sc);
                const cs = ([0, 1, 2] as const).map((k) => pointsCorr(sub.filter((m) => tercile(cuts, k)(m.r))));
                const ok = cs.map((c) => c.r).filter(Number.isFinite);
                out(`| ${name} | ${sc} ${mode} | ${cs.map(rc).join(' | ')} | ${fmt(mean(ok), 2)} |`);
            }
        }
    }
    out();
    const report = lines.join('\n') + '\n';
    const target = args('out')[0];
    if (target) fs.writeFileSync(target, report);
    process.stdout.write(report);
}

void main();
