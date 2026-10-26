import type { WaveRun } from './wave-compare';

/**
 * The `baseline` crew's rows of earlier results files, by seed, for a screen to reuse instead of
 * replaying them (a reference crew plays a seed deterministically). Throws when two rows of one seed
 * disagree on pass: then the baseline is not deterministic and its rows are no cache.
 */
export function baselineCache(files: readonly (readonly WaveRun[])[], baseline: string): Map<number, WaveRun> {
    const cache = new Map<number, WaveRun>();
    for (const run of files.flat()) {
        if (run.crew !== baseline) continue;
        const cached = cache.get(run.seed);
        if (cached && Boolean(cached.passed) !== Boolean(run.passed)) {
            throw new Error(`${baseline} seed ${run.seed}: cached rows disagree on pass`);
        }
        if (!cached) cache.set(run.seed, run);
    }
    return cache;
}
