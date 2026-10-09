/**
 * Statistics shared by the matched-seed validators (`engineer-validate.ts`, `helms-validate.ts`):
 * deterministic bootstrap, rank correlation over policy pairs, and a correlation whose interval resamples seeds.
 */

export const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

/** Deterministic generator, so a report's intervals reproduce. */
export function rng(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

interface Interval {
    readonly mean: number;
    readonly lo: number;
    readonly hi: number;
    readonly n: number;
}

/** Mean of `deltas` and its 95% bootstrap interval. */
export function bootstrap(deltas: readonly number[], resamples = 2000): Interval {
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

export const fmt = (x: number, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '–');

/** `mean [lo, hi] n=…` with ✓ when the interval is above 0 and ✗ when below. */
export const ci = (b: Interval) =>
    b.n ? `${fmt(b.mean)} [${fmt(b.lo)}, ${fmt(b.hi)}] n=${b.n}${b.lo > 0 ? ' ✓' : b.hi < 0 ? ' ✗' : ''}` : '–';

function ranks(xs: readonly number[]) {
    const order = xs.map((x, i) => [x, i] as const).sort((a, c) => a[0] - c[0]);
    const out = new Array<number>(xs.length);
    for (let i = 0; i < order.length;) {
        let j = i;
        while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
        for (let n = i; n <= j; n++) out[order[n][1]] = (i + j) / 2;
        i = j + 1;
    }
    return out;
}

/** One pair of policies on a seed: the score gap and the outcome gap. */
export interface RankedPair {
    readonly seed: number;
    readonly x: number;
    readonly y: number;
}

function spearman(rows: readonly RankedPair[]) {
    if (rows.length < 5) return NaN;
    const a = ranks(rows.map((r) => r.x));
    const b = ranks(rows.map((r) => r.y));
    const ma = mean(a);
    const mb = mean(b);
    let sab = 0;
    let saa = 0;
    let sbb = 0;
    a.forEach((x, i) => {
        sab += (x - ma) * (b[i] - mb);
        saa += (x - ma) ** 2;
        sbb += (b[i] - mb) ** 2;
    });
    return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : NaN;
}

/** Spearman r of score gap with outcome gap, its 95% CI over seeds, and the share of pairs ordered the same way. */
export function rankingValidity(rows: readonly RankedPair[]) {
    const bySeed = new Map<number, RankedPair[]>();
    for (const r of rows) bySeed.set(r.seed, [...(bySeed.get(r.seed) ?? []), r]);
    const groups = [...bySeed.values()];
    const next = rng(20261005);
    const draws: number[] = [];
    for (let b = 0; b < 500 && groups.length; b++) {
        const c = spearman(groups.flatMap(() => groups[Math.floor(next() * groups.length)]));
        if (Number.isFinite(c)) draws.push(c);
    }
    draws.sort((a, c) => a - c);
    return {
        n: rows.length,
        r: spearman(rows),
        lo: draws.length > 20 ? draws[Math.floor(0.025 * draws.length)] : NaN,
        hi: draws.length > 20 ? draws[Math.floor(0.975 * draws.length)] : NaN,
        sign: mean(rows.map((r) => Number(Math.sign(r.x) === Math.sign(r.y)))),
    };
}

/** A frame of a moment-wise comparison: score and outcome, each minus its mean over the policies at that second. */
export interface MomentPoint {
    readonly seed: number;
    readonly k: number;
    readonly y: number;
}

/** Pearson r and its 95% CI over seeds (resampled seeds, from per-seed sufficient statistics) of the score with the outcome. */
export function seedCorr(points: readonly MomentPoint[]) {
    const bySeed = new Map<number, number[]>();
    for (const m of points) {
        const s = bySeed.get(m.seed) ?? [0, 0, 0, 0, 0, 0];
        s[0]++;
        s[1] += m.k;
        s[2] += m.y;
        s[3] += m.k * m.k;
        s[4] += m.y * m.y;
        s[5] += m.k * m.y;
        bySeed.set(m.seed, s);
    }
    const stats = [...bySeed.values()];
    const corr = (xs: readonly number[][]) => {
        const t = [0, 0, 0, 0, 0, 0];
        for (const x of xs) x.forEach((v, j) => (t[j] += v));
        const [n, sx, sy, sxx, syy, sxy] = t;
        const vx = sxx - (sx * sx) / n;
        const vy = syy - (sy * sy) / n;
        return n > 20 && vx > 1e-12 && vy > 1e-15 ? (sxy - (sx * sy) / n) / Math.sqrt(vx * vy) : NaN;
    };
    const r = corr(stats);
    const next = rng(20261005);
    const draws: number[] = [];
    for (let b = 0; b < 500 && stats.length; b++) {
        const c = corr(stats.map(() => stats[Math.floor(next() * stats.length)]));
        if (Number.isFinite(c)) draws.push(c);
    }
    draws.sort((a, c) => a - c);
    return {
        r,
        lo: draws.length > 20 ? draws[Math.floor(0.025 * draws.length)] : NaN,
        hi: draws.length > 20 ? draws[Math.floor(0.975 * draws.length)] : NaN,
    };
}
