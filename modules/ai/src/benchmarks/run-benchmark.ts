import { BrainSpec, loadBrainSpec } from '../brain/spec';
import { HeadlessGame, SERVER_TICK_HZ } from '@starwards/server/src/test/headless-game';
import { JevClient, jevClient } from '../brain/jev-client';
import { MeteredJevClient, answerCacheFromEnv, meteredJevClient } from '../brain/jev-cache';
import { idlePolicy, jevPolicy } from '../brain/policies';

import { HeadlessRecorder } from '@starwards/server/src/test/headless-recorder';
import { Policy } from '../brain/brain';
import { SeatPlan } from '../crew/crew';
import fc from 'fast-check';
import { headlessCrew } from '../crew/crew';
import { loadBenchmark } from './benchmark';
import { makeReferencePolicy } from '../brain/reference-policy';
import path from 'node:path';

const BRAINS_DIR = path.resolve(__dirname, '../../brains');

export type BenchmarkRunOptions = {
    benchmark: string;
    /** The brain under test; it must play the benchmark's station. */
    brainPath: string;
    policy: 'jev' | 'reference' | 'idle';
    seed: number;
    outDir: string;
    latencySeconds: number;
    jevRequestsPerMinute?: number;
};

export type BenchmarkRunResult = {
    benchmark: string;
    brain: string;
    seed: number;
    params: unknown;
    seconds: number;
    metrics: { score: number } & Record<string, number>;
    decisions: number;
    fallbacks: number;
    refused: number;
    /** Tokens paid for in this run; a request answered from the answer cache adds to `cachedTokens` instead. */
    inputTokens: number;
    cachedTokens: number;
    cacheHits: number;
    recording: string;
};

function policyFor(kind: BenchmarkRunOptions['policy'], spec: BrainSpec, jev: () => JevClient): Policy {
    if (kind === 'jev') return jevPolicy(spec, jev());
    if (kind === 'reference') return makeReferencePolicy(spec.decisionSeconds);
    return idlePolicy;
}

/**
 * Plays one seed of a benchmark with the brain under test at its station and fixed policies at the
 * supporting ones, recording the run with every decision, and scores it.
 */
export async function runBenchmark(options: BenchmarkRunOptions): Promise<BenchmarkRunResult> {
    const benchmark = loadBenchmark(options.benchmark);
    const spec = loadBrainSpec(options.brainPath);
    if (spec.station !== benchmark.station) {
        throw new Error(
            `benchmark ${benchmark.name} tests ${benchmark.station}; brain ${spec.id} plays ${spec.station}`,
        );
    }
    // made on first use, so a benchmark without a Jev seat never needs the key
    let metered: MeteredJevClient | undefined;
    const jev = () =>
        (metered ??= meteredJevClient(
            jevClient({ requestsPerMinute: options.jevRequestsPerMinute }),
            answerCacheFromEnv(),
        ));
    const seats: SeatPlan[] = [
        { station: spec.station, spec, policy: policyFor(options.policy, spec, jev) },
        ...benchmark.supporting.map(({ station, policy }) => {
            const supportSpec = loadBrainSpec(path.join(BRAINS_DIR, `${station}.v1.json`));
            return { station, spec: supportSpec, policy: policyFor(policy, supportSpec, jev) };
        }),
    ];
    const [params] = fc.sample(benchmark.params, { seed: options.seed, numRuns: 1 });
    const game = HeadlessGame.start(benchmark.createMap(params), options.seed, { crewedPlayer: true });
    const dir = path.join(options.outDir, `${spec.id}.v${spec.version}-${options.policy}`);
    const recorder = new HeadlessRecorder(
        game,
        dir,
        `${benchmark.name}_seed${options.seed}`,
        1,
        params,
        SERVER_TICK_HZ,
    );
    const crew = headlessCrew({ shipId: benchmark.shipId, seats, latencySeconds: options.latencySeconds });
    const scorer = benchmark.scorer();
    const dt = 1 / SERVER_TICK_HZ;
    await recorder.capture();
    while (game.seconds < benchmark.timeoutSeconds && !scorer.done?.(game)) {
        await crew.beforeTick(game, recorder);
        game.tick(dt);
        scorer.sample(game, dt);
        await recorder.capture();
    }
    await recorder.capture(true);
    const own = Object.entries(crew.stats.controls).filter(([key]) => key.startsWith(`${spec.station}/`));
    return {
        benchmark: benchmark.name,
        brain: `${spec.id}@${spec.version}/${options.policy}`,
        seed: options.seed,
        params,
        seconds: game.seconds,
        metrics: scorer.result(),
        decisions: own.reduce((sum, [, s]) => sum + s.decisions, 0),
        fallbacks: crew.stats.fallbacks,
        refused: crew.stats.refused,
        inputTokens: crew.stats.inputTokens,
        cachedTokens: metered?.usage.cachedTokens ?? 0,
        cacheHits: metered?.usage.cacheHits ?? 0,
        recording: recorder.filePath,
    };
}
