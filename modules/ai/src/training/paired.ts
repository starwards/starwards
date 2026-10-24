/** How a candidate did against a baseline on the same seeds, seed by seed. Differences are candidate − baseline. */
export type PairedComparison = {
    pairs: number;
    meanDiff: number;
    /** 95% Student-t interval of the mean per-seed difference; the whole line with fewer than two seeds. */
    ci: [low: number, high: number];
    /** Seeds on which the candidate was higher, lower, or equal. */
    wins: number;
    losses: number;
    ties: number;
    /** Two-sided exact sign test over the seeds that differ; 1 when none does. */
    signP: number;
};

/** Two-sided 95% Student-t quantile by degrees of freedom (1..30); the normal's beyond. */
const T_975 = [
    12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11,
    2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];

/** P(X ≤ k) for X ~ Binomial(n, ½). */
function binomialHalfCdf(k: number, n: number) {
    let term = 0.5 ** n;
    let sum = term;
    for (let i = 1; i <= k; i++) {
        term *= (n - i + 1) / i;
        sum += term;
    }
    return sum;
}

/**
 * Compares two crews (or versions) that played the same seeds, one pair per seed. Pairing removes the
 * seed's own difficulty from the comparison: what is left is the difference the crew made, so fewer
 * seeds show it. `baseline[i]` and `candidate[i]` must be the same seed.
 *
 * The interval is the t interval of the differences, not a bootstrap percentile: with 4 seeds the
 * percentile interval called 11–36% of archived reruns of one crew different, the t interval 1–4%.
 */
export function pairedComparison(baseline: readonly number[], candidate: readonly number[]): PairedComparison {
    if (baseline.length !== candidate.length) {
        throw new Error(`paired comparison needs the same seeds: ${baseline.length} against ${candidate.length}`);
    }
    const diffs = candidate.map((c, i) => c - baseline[i]);
    const pairs = diffs.length;
    const meanDiff = diffs.reduce((a, b) => a + b, 0) / Math.max(1, pairs);
    const variance = pairs > 1 ? diffs.reduce((a, d) => a + (d - meanDiff) ** 2, 0) / (pairs - 1) : Infinity;
    const halfWidth = variance === 0 ? 0 : (T_975[pairs - 2] ?? 1.96) * Math.sqrt(variance / pairs);
    const wins = diffs.filter((d) => d > 0).length;
    const losses = diffs.filter((d) => d < 0).length;
    return {
        pairs,
        meanDiff,
        ci: [meanDiff - halfWidth, meanDiff + halfWidth],
        wins,
        losses,
        ties: pairs - wins - losses,
        signP: Math.min(1, 2 * binomialHalfCdf(Math.min(wins, losses), wins + losses)),
    };
}

/** Whether the interval leaves zero out: the difference is beyond seed noise. */
export function isSignificant({ ci: [low, high] }: PairedComparison) {
    return low > 0 || high < 0;
}

const signed = (n: number, digits: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}`;

/** `+0.084 [+0.021, +0.150], 7 up / 1 down / 0 same, sign p 0.070`. */
export function pairedText(c: PairedComparison, digits = 3) {
    return `${signed(c.meanDiff, digits)} [${signed(c.ci[0], digits)}, ${signed(c.ci[1], digits)}], ${c.wins} up / ${c.losses} down / ${c.ties} same, sign p ${c.signP.toFixed(3)}`;
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 erf, |error| < 1.5e-7). */
export function normalCdf(z: number) {
    const x = Math.abs(z) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * x);
    const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
    const erf = 1 - poly * Math.exp(-x * x);
    return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Seeded uniform generator (mulberry32), local so the boundaries are the same on every call. */
function uniform(seed: number) {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const obfCache = new Map<string, number>();

/**
 * The O'Brien–Fleming constant `c` for two-sided level `alpha` at the given looks: look `k` rejects when
 * |z_k| ≥ c / √(n_k / n_K). It is the 1 − alpha quantile of max_k |B(t_k)| of a Brownian motion, found
 * by a fixed-seed simulation (4 looks at 5%: ≈ 2.04).
 */
export function obrienFlemingConstant(looks: readonly number[], alpha: number, paths = 200_000) {
    const key = `${looks.join(',')}@${alpha}`;
    const cached = obfCache.get(key);
    if (cached !== undefined) return cached;
    const last = looks[looks.length - 1];
    const rng = uniform(20261023);
    const maxima = new Float64Array(paths);
    for (let p = 0; p < paths; p++) {
        let b = 0;
        let prev = 0;
        let max = 0;
        for (const n of looks) {
            const gauss = Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
            b += gauss * Math.sqrt((n - prev) / last);
            prev = n;
            max = Math.max(max, Math.abs(b));
        }
        maxima[p] = max;
    }
    maxima.sort();
    const c = maxima[Math.ceil((1 - alpha) * paths) - 1];
    obfCache.set(key, c);
    return c;
}

export type SequentialDecision = 'better' | 'worse' | 'futile' | 'inconclusive' | 'continue';

export type SequentialScreen = {
    decision: SequentialDecision;
    /** Seeds of the last look taken (0 before the first). */
    seeds: number;
    /** The look to play to next, when `decision` is `continue`. */
    nextLook?: number;
    z: number;
    /** |z| that stops the screen at that look. */
    boundary: number;
    /** Chance, under the trend so far, that the final look calls the candidate better. */
    conditionalPower: number;
    comparison?: PairedComparison;
    /** Seeds the baseline passed (> 0) and the candidate did not: the non-inferiority count. */
    passSeedsLost: number;
};

export type SequentialOptions = {
    /** Seed counts at which the screen looks; the last is the most it ever plays. */
    looks?: readonly number[];
    /** Two-sided level over all looks. */
    alpha?: number;
    /** An interim look stops as futile when the conditional power is below this. */
    futility?: number;
};

export const SEQUENTIAL_LOOKS: readonly number[] = [32, 64, 128, 192];

/**
 * Group-sequential paired screen of a candidate against a baseline on the same seeds, in seed order:
 * O'Brien–Fleming looks (default 32/64/128/192 seeds, two-sided 5%) with futility when the conditional
 * power to call the candidate better, under the trend so far, drops below 10%. Given however many seeds
 * are played, it replays every look they reach and stops at the first boundary; `continue` means play
 * on to `nextLook`. A fixed 32-seed screen has ~15% power for +3/32; this spends the seeds where the
 * answer is still open.
 *
 * Metric: binary pass. On the archived W-waves guard runs a continuous surrogate (logistic of station
 * capsule + armor lost) tracked pass at r .97 but gave no paired power over it, and the 450 s state
 * predicted nothing (LOO R² < 0), so neither replaces pass. Guard against guard on disjoint seeds
 * rejects ≤ 10% (spec).
 */
export function sequentialScreen(
    baseline: readonly number[],
    candidate: readonly number[],
    { looks = SEQUENTIAL_LOOKS, alpha = 0.05, futility = 0.1 }: SequentialOptions = {},
): SequentialScreen {
    if (baseline.length !== candidate.length) {
        throw new Error(`sequential screen needs the same seeds: ${baseline.length} against ${candidate.length}`);
    }
    const c = obrienFlemingConstant(looks, alpha);
    const last = looks[looks.length - 1];
    let result: SequentialScreen = {
        decision: 'continue',
        seeds: 0,
        z: 0,
        boundary: Infinity,
        conditionalPower: 1,
        passSeedsLost: 0,
    };
    for (const [k, n] of looks.entries()) {
        if (n > baseline.length) return { ...result, decision: 'continue', nextLook: n };
        const base = baseline.slice(0, n);
        const cand = candidate.slice(0, n);
        const diffs = cand.map((x, i) => x - base[i]);
        const mean = diffs.reduce((a, b) => a + b, 0) / n;
        const se = Math.sqrt(diffs.reduce((a, d) => a + (d - mean) ** 2, 0) / (n - 1) / n);
        const z = se > 0 ? mean / se : mean === 0 ? 0 : Math.sign(mean) * Infinity;
        const t = n / last;
        const boundary = c / Math.sqrt(t);
        const b = z * Math.sqrt(t);
        // B-value drift under the current trend is b / t; what is left to come is (1 − t) of it
        const conditionalPower =
            t >= 1 ? Number(z >= boundary) : 1 - normalCdf((c - b - (b / t) * (1 - t)) / Math.sqrt(1 - t));
        result = {
            decision: 'inconclusive',
            seeds: n,
            z,
            boundary,
            conditionalPower,
            comparison: pairedComparison(base, cand),
            passSeedsLost: base.filter((x, i) => x > 0 && cand[i] <= 0).length,
        };
        if (z >= boundary) return { ...result, decision: 'better' };
        if (z <= -boundary) return { ...result, decision: 'worse' };
        if (k < looks.length - 1 && conditionalPower < futility) return { ...result, decision: 'futile' };
    }
    return result;
}

/** `futile at 32 seeds: z −1.16 vs ±4.99, conditional power 0.00, −0.125 [...], 8 pass seed(s) lost`. */
export function sequentialText(s: SequentialScreen) {
    const head = s.decision === 'continue' ? `continue to ${s.nextLook} seeds` : `${s.decision} at ${s.seeds} seeds`;
    if (!s.comparison) return head;
    return `${head}: z ${signed(s.z, 2)} vs ±${s.boundary.toFixed(2)}, conditional power ${s.conditionalPower.toFixed(2)}, ${pairedText(s.comparison)}, ${s.passSeedsLost} pass seed(s) lost`;
}

export type RaceRound = {
    /** Neither bound has cleared the reference yet. */
    alive: string[];
    /** Upper bound of (alternative − reference) below zero. */
    eliminated: string[];
    /** Lower bound above zero. */
    winners: string[];
};

/** Rollouts per alternative at each racing round. */
export const RACE_ROLLOUTS: readonly number[] = [8, 16, 32, 64];

/**
 * One racing round over a state's alternatives against a reference action (sweep: `hold_here`).
 * `outcomes` maps each alternative to its per-rollout outcomes; rollout `j` of every alternative forks
 * at the same jittered time, so differences pair by rollout. An alternative leaves the race once the
 * bound mean ± z·se of its paired difference clears zero; z 2.5 is ≈ 2.5% one-sided spread over the
 * four rounds (Bonferroni). Equal outcomes on every rollout (se 0) stay alive unless the mean is off zero.
 */
export function raceRound(outcomes: ReadonlyMap<string, readonly number[]>, reference: string, z = 2.5): RaceRound {
    const ref = outcomes.get(reference);
    const round: RaceRound = { alive: [], eliminated: [], winners: [] };
    for (const [alt, xs] of outcomes) {
        if (alt === reference) continue;
        const n = ref ? Math.min(xs.length, ref.length) : 0;
        if (n < 2 || !ref) {
            round.alive.push(alt);
            continue;
        }
        const d = Array.from({ length: n }, (_, j) => xs[j] - ref[j]);
        const mean = d.reduce((a, b) => a + b, 0) / n;
        const se = Math.sqrt(d.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1) / n);
        if (mean + z * se < 0) round.eliminated.push(alt);
        else if (mean - z * se > 0) round.winners.push(alt);
        else round.alive.push(alt);
    }
    return round;
}
