import { GameMap } from '@starwards/core/internal';
import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import fc from 'fast-check';

/**
 * A station benchmark: one narrow, professional task for one station (helms plays tag, weapons
 * shoots on a range), scored on what that station is for rather than on a whole fight. Other
 * stations the task needs are played by fixed policies, so a score moves only with the brain under
 * test. Layouts come from a fast-check arbitrary, so a seed names a layout and every brain version
 * meets the same ones.
 *
 * A benchmark file is `benchmarks/<name>.bench.ts` with a default export of this type; the runner
 * loads it by name, so adding a benchmark touches no other file.
 */
export type Benchmark<P> = {
    name: string;
    /** The station whose brain is under test. */
    station: string;
    description: string;
    params: fc.Arbitrary<P>;
    createMap(params: P): GameMap;
    /** The ship the stations sit on. */
    shipId: string;
    timeoutSeconds: number;
    /** Stations the task also needs, played by fixed policies: never the station under test. */
    supporting: readonly { station: string; policy: 'reference' | 'idle' }[];
    /** A fresh scorer per run. */
    scorer(): Scorer;
};

/**
 * Watches a run tick by tick from the game's true state (the scorer is the referee, not a crew
 * member: it may see everything) and gives the score at the end. `score` is the one number brain
 * versions are ranked by, higher is better; the other metrics explain it.
 */
export type Scorer = {
    sample(game: HeadlessGame, dt: number): void;
    /** Ends the run early, e.g. when the task is achieved. */
    done?(game: HeadlessGame): boolean;
    result(): { score: number } & Record<string, number>;
};

export function loadBenchmark(name: string): Benchmark<unknown> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require(`./${name}.bench`) as { default?: Benchmark<unknown> };
    if (!loaded.default) {
        throw new Error(`benchmarks/${name}.bench.ts has no default export`);
    }
    return loaded.default;
}
