import { WaveOutcome } from '@starwards/server/src/test/training/wave-rung';
import { mulberry32 } from '@starwards/core/internal';

/**
 * Continuous fitness of a wave run: what the binary pass hides. Two crews that both pass (or both
 * fail) still differ in how long the stations held, how much of them was shot away and how fast the
 * raiders died, so these separate a single decision lever on far fewer seeds than the pass count.
 */
export type WaveFitness = {
    /** Sim-seconds until the first station was lost, or the whole run when none was. */
    holdSeconds: number;
    /** Capsule integrity lost over the three stations (0..3), a lost station counting 1. */
    stationCapsuleLost: number;
    /** Armor health lost over the three stations (0..3), a lost station counting 1. */
    stationArmorLost: number;
    raidersKilled: number;
    killsPerMinute: number;
};

export const WAVE_METRICS: readonly { name: keyof WaveFitness; higherIsBetter: boolean }[] = [
    { name: 'holdSeconds', higherIsBetter: true },
    { name: 'stationCapsuleLost', higherIsBetter: false },
    { name: 'stationArmorLost', higherIsBetter: false },
    { name: 'raidersKilled', higherIsBetter: true },
    { name: 'killsPerMinute', higherIsBetter: true },
];

/** `seconds` stands in for the end time of results recorded before outcomes carried it. */
export function waveFitness(waves: WaveOutcome, seconds = 0): WaveFitness {
    const end = waves.endSeconds ?? seconds;
    return {
        holdSeconds: waves.firstStationLostAt ?? end,
        stationCapsuleLost: waves.stationCapsuleLost ?? NaN,
        stationArmorLost: waves.stationArmorLost ?? NaN,
        raidersKilled: waves.raidersKilled,
        killsPerMinute: end > 0 ? waves.raidersKilled / (end / 60) : 0,
    };
}

/**
 * Percentile bootstrap 95% interval of the mean of `xs`, resampled with a fixed seed so a report
 * reprints the same interval. Pair it with the t interval (`training/paired.ts`): on few seeds the
 * percentile interval is too narrow; agreement of the two on 16+ seeds is the sign the sample is
 * large enough to trust either.
 */
export function bootstrapMeanCI(xs: readonly number[], resamples = 10_000, seed = 1): [low: number, high: number] {
    const rng = mulberry32(seed);
    const n = xs.length;
    const means = new Float64Array(resamples);
    for (let r = 0; r < resamples; r++) {
        let sum = 0;
        for (let i = 0; i < n; i++) sum += xs[Math.floor(rng() * n)];
        means[r] = sum / n;
    }
    means.sort();
    return [means[Math.floor(0.025 * (resamples - 1))], means[Math.ceil(0.975 * (resamples - 1))]];
}
