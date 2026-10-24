import { WaveRun } from '../training/wave-compare';

/** Hold time a failed run is censored at, and the value when no run failed. */
const CENSOR_SECONDS = 1500;

/**
 * The search's selection metric (revision 2026-10-22d of the waves plan), compared lexicographically:
 * W-waves passes, then mean time to the first station loss over the failed runs (censored at 1500 s),
 * then mean wave-3 station damage.
 */
export type LexicographicFitness = {
    passes: number;
    failHoldSeconds: number;
    wave3StationDamage: number;
};

const isPass = (r: WaveRun) => r.stationsLost === 0 && (r.survived ?? 0) >= 3;

export function lexicographicFitness(runs: readonly WaveRun[], crew: string): LexicographicFitness {
    const mine = runs.filter((r) => r.crew === crew);
    const failed = mine.filter((r) => !isPass(r));
    const mean = (xs: number[], empty: number) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : empty);
    return {
        passes: mine.length - failed.length,
        failHoldSeconds: mean(
            failed.map((r) => Math.min(CENSOR_SECONDS, r.fitness.holdSeconds)),
            CENSOR_SECONDS,
        ),
        wave3StationDamage: mean(
            mine.map((r) => r.ammo?.stationDamageByWave[3] ?? 0),
            0,
        ),
    };
}

/** Sort comparator, best first. */
export function compareLexicographic(a: LexicographicFitness, b: LexicographicFitness) {
    return b.passes - a.passes || b.failHoldSeconds - a.failHoldSeconds || a.wave3StationDamage - b.wave3StationDamage;
}
