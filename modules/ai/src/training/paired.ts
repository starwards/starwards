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
