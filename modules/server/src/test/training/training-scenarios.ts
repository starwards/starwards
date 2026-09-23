import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { GameMap, ShipModel } from '@starwards/core/internal';
import { GunnerySample, gunneryFractions, sampleGunnery } from './gunnery-metrics';
import { HeadlessGame, SERVER_TICK_HZ } from '../headless-game';
import {
    T0Params,
    TRAINING_PLAYER_ID,
    TRAINING_TARGET_ID,
    createTrainingT0Map,
    createTrainingT1Map,
} from '../../scenarios/training';
import { ingest, storePathFor } from './analysis/store';

import { HeadlessRecorder } from '../headless-recorder';
import { computeChecks } from './analysis/checks';
import { computeEvents } from './analysis/events';
import { extractMetrics } from './analysis/extract';
import fc from 'fast-check';

export interface TrainingResult {
    readonly scenario: string;
    readonly seed: number;
    readonly params: unknown;
    readonly killed: boolean;
    /** Sim-seconds to kill; the timeout when not killed. */
    readonly seconds: number;
    /** First sim-second the target's armor was fully stripped, if ever. */
    readonly armorStrippedAt: number | null;
    /** Target `healthRatio` at end (0 when killed). */
    readonly targetHealth: number;
    readonly shellsFired: number;
    /** Sim-seconds with at least one GVTS chain gun firing. */
    readonly secondsFiring: number;
    /** Mean GVTS-to-target distance while the target lived. */
    readonly meanDistance: number;
    /** Metres the target moved from its spawn point. */
    readonly targetDrift: number;
    /** GVTS speed (m/s) at end. */
    readonly gvtsSpeed: number;
    /** Fraction of sim-time the target was within the GVTS chain gun's `maxShellRange`. */
    readonly inRangeFraction: number;
    /** Fraction of sim-time the GVTS's current aim would put a shell's danger zone on the target. */
    readonly killZoneFraction: number;
    /** Distinct explosions that ever overlapped the target (recorder sidecar, tick-exact). */
    readonly blastHits: number;
    readonly hz: number;
    /** Names of `analysis/checks.ts` checks that failed on this run's store. */
    readonly failedChecks: readonly string[];
    readonly recording?: string;
    readonly frames?: number;
    readonly wallSeconds: number;
}

/** A training rung: a fast-check arbitrary for its layout, and the map built from one sample. */
interface TrainingScenario<P> {
    readonly name: string;
    readonly description: string;
    readonly params: fc.Arbitrary<P>;
    createMap(params: P): GameMap;
}

export const T0_PLAY_DEAD_DRAGONFLY: TrainingScenario<T0Params> = {
    name: 'T0',
    description: 'GVTS vs one PLAY_DEAD dragonfly-MK1, 2-8 km, any bearing',
    params: fc.record({
        distance: fc.integer({ min: 2000, max: 8000 }),
        bearing: fc.integer({ min: 0, max: 359 }),
    }),
    createMap: createTrainingT0Map,
};

export const T1_ATTACKING_DRAGONFLY: TrainingScenario<T0Params> = {
    name: 'T1',
    description: 'GVTS vs one dragonfly-MK1 attacking it, 2-8 km, any bearing',
    params: fc.record({
        distance: fc.integer({ min: 2000, max: 8000 }),
        bearing: fc.integer({ min: 0, max: 359 }),
    }),
    createMap: createTrainingT1Map,
};

/** T1 with another hull attacking the GVTS: the TTK ladder's heavier rungs. */
const t1WithHull = (name: string, model: ShipModel): TrainingScenario<T0Params> => ({
    ...T1_ATTACKING_DRAGONFLY,
    name,
    description: `GVTS vs one ${model} attacking it, 2-8 km, any bearing`,
    createMap: (params) => createTrainingT1Map(params, model),
});

export const trainingScenarios: Record<string, TrainingScenario<never>> = {
    T0: T0_PLAY_DEAD_DRAGONFLY as TrainingScenario<never>,
    T1: T1_ATTACKING_DRAGONFLY as TrainingScenario<never>,
    'T1-MK2': t1WithHull('T1-MK2', 'dragonfly-MK2') as TrainingScenario<never>,
    'T1-predator': t1WithHull('T1-predator', 'predator') as TrainingScenario<never>,
};

/**
 * Frame interval of the scratch recording made when the caller doesn't persist one. Per-tick frames
 * at 60 Hz cost ~66x the run's wall time to record and ingest; `extract.ts`'s frame-based metrics
 * (`armorStrippedAt`, `meanDistance`) drop to this resolution, while fire time (events) and the
 * end state (the forced final frame) stay exact.
 */
const SCRATCH_INTERVAL_SECONDS = 1;

export interface TrainingRunOptions {
    readonly seed: number;
    readonly timeoutSeconds: number;
    readonly hz?: number;
    /** Omit to skip recording -- the run still records to a scratch dir so `extract.ts` has a
     * store to read (see *Store* below), but that scratch recording is deleted before returning. */
    readonly recording?: { readonly dir: string; readonly intervalSimSeconds: number };
}

/**
 * One run: `seed` drives both the fast-check layout sample and the die. `TrainingResult`'s
 * scalars are computed by `analysis/extract.ts` from a recording -- there is exactly one
 * implementation of these metrics, not one inline and one in the analysis CLI. When the caller
 * doesn't ask for a persisted recording, the run still records (at `SCRATCH_INTERVAL_SECONDS`) into a scratch
 * directory that is deleted before returning.
 */
export async function runTraining<P>(
    scenario: TrainingScenario<P>,
    { seed, timeoutSeconds, hz = SERVER_TICK_HZ, recording }: TrainingRunOptions,
): Promise<TrainingResult> {
    const started = Date.now();
    const [params] = fc.sample(scenario.params, { seed, numRuns: 1 });
    const game = HeadlessGame.start(scenario.createMap(params), seed);
    const gvts = game.api.getShip(TRAINING_PLAYER_ID);
    if (!gvts) {
        throw new Error('GVTS missing');
    }
    const dt = 1 / hz;

    const scratchDir = recording?.dir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'starwards-training-'));
    const intervalSimSeconds = recording?.intervalSimSeconds ?? SCRATCH_INTERVAL_SECONDS;
    const recorder = new HeadlessRecorder(
        game,
        scratchDir,
        `${scenario.name}_seed${seed}`,
        intervalSimSeconds,
        params,
        hz,
    );

    // Per-tick samples of what the bot believed (in range, in kill zone): neither is in the
    // recording, so `extract.ts` cannot compute them.
    const gunnery: GunnerySample[] = [];
    await recorder.capture();
    while (game.seconds < timeoutSeconds) {
        game.tick(dt);
        await recorder.capture();
        const target = game.api.getObject(TRAINING_TARGET_ID);
        if (!target || target.destroyed) {
            break;
        }
        const targetObject = game.spaceManager.state.get(TRAINING_TARGET_ID);
        if (targetObject) {
            gunnery.push(sampleGunnery(gvts.state, targetObject));
        }
    }
    await recorder.capture(true);

    const dbPath = storePathFor(recorder.filePath);
    const store = await ingest(dbPath, recorder.filePath, { player: TRAINING_PLAYER_ID, target: TRAINING_TARGET_ID });
    await computeEvents(store, recorder.filePath);
    const checkResults = await computeChecks(store, recorder.filePath);
    const failedChecks = checkResults.filter((c) => c.status === 'fail').map((c) => c.name);
    const metrics = await extractMetrics(store, recorder.filePath, {
        playerId: TRAINING_PLAYER_ID,
        targetId: TRAINING_TARGET_ID,
    });
    await store.close();

    const wallSeconds = (Date.now() - started) / 1000;
    if (recording) {
        return {
            scenario: scenario.name,
            seed,
            params,
            ...metrics,
            ...gunneryFractions(gunnery),
            hz,
            failedChecks,
            recording: recorder.filePath,
            frames: recorder.frameCount,
            wallSeconds,
        };
    }
    await deleteScratchDir(scratchDir);
    return {
        scenario: scenario.name,
        seed,
        params,
        ...metrics,
        ...gunneryFractions(gunnery),
        hz,
        failedChecks,
        wallSeconds,
    };
}

/** Scratch dirs still held open when their run finished; swept once more at process exit. */
const undeletedScratchDirs = new Set<string>();

/**
 * Cleanup of the scratch recording+store when the caller didn't ask to keep one. DuckDB's Windows
 * native file handle can lag its `close()` callback (see analysis/store.spec.ts), so a few retries
 * absorb that without failing the run. A dir still busy after them is swept again at process exit,
 * once every DuckDB instance is gone -- Windows never reclaims `%TEMP%` on its own.
 */
async function deleteScratchDir(dir: string): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            fs.rmSync(dir, { recursive: true, force: true });
            return;
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }
    if (!undeletedScratchDirs.size) {
        process.once('exit', () => {
            for (const pending of undeletedScratchDirs) {
                try {
                    fs.rmSync(pending, { recursive: true, force: true });
                } catch {
                    // still locked by another process; nothing more to do at exit
                }
            }
        });
    }
    undeletedScratchDirs.add(dir);
}
