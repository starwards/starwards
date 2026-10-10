import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { GameMap, ShipModel } from '@starwards/core/internal';
import { GunnerySample, gunneryFractions, sampleGunnery } from './gunnery-metrics';
import { HeadlessGame, SERVER_TICK_HZ } from '../headless-game';
import {
    T0Lab,
    T0Params,
    T2Params,
    TRAINING_PLAYER_ID,
    TRAINING_TARGET2_ID,
    TRAINING_TARGET_ID,
    createTrainingT0Map,
    createTrainingT1Map,
    createTrainingT2Map,
} from '../../scenarios/training';
import {
    WeaponsMultiParams,
    createTrainingWeaponsMultiMap,
    createTrainingWeaponsOutrangedMap,
} from '../../scenarios/training-weapons';
import { ingest, storePathFor } from './analysis/store';

import { HeadlessRecorder } from '../headless-recorder';
import { computeChecks } from './analysis/checks';
import { computeEvents } from './analysis/events';
import { extractMetrics } from './analysis/extract';
import fc from 'fast-check';
import { killedAt } from './analysis/metrics';

export interface TrainingResult {
    readonly scenario: string;
    readonly seed: number;
    readonly params: unknown;
    /** Every enemy of the rung destroyed. */
    readonly killed: boolean;
    /** Enemies destroyed, of {@link enemies}. */
    readonly kills: number;
    /** Enemies on the rung: 1, or the attackers of a multi-enemy rung. */
    readonly enemies: number;
    /** Sim-seconds to the last kill; the timeout when not every enemy was killed. */
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
    /** The persisted `.sgr`, when the run was asked to keep one. */
    readonly recording?: string;
    /** Frames in the persisted recording. */
    readonly frames?: number;
    readonly wallSeconds: number;
}

/** A training rung: a fast-check arbitrary for its layout, and the map built from one sample. */
interface TrainingScenario<P> {
    readonly name: string;
    readonly description: string;
    readonly params: fc.Arbitrary<P>;
    createMap(params: P): GameMap;
    /** Ids of every enemy the run must destroy; the first is the target the per-target metrics read. Default: the one target. */
    readonly enemies?: readonly string[];
}

const T0_PLAY_DEAD_DRAGONFLY: TrainingScenario<T0Params> = {
    name: 'T0',
    description: 'GVTS vs one PLAY_DEAD dragonfly-MK1, 2-8 km, any bearing',
    params: fc.record({
        distance: fc.integer({ min: 2000, max: 8000 }),
        bearing: fc.integer({ min: 0, max: 359 }),
    }),
    createMap: createTrainingT0Map,
};

const T1_ATTACKING_DRAGONFLY: TrainingScenario<T0Params> = {
    ...T0_PLAY_DEAD_DRAGONFLY,
    name: 'T1',
    description: 'GVTS vs one dragonfly-MK1 attacking it, 2-8 km, any bearing',
    createMap: createTrainingT1Map,
};

type T0WideParams = T0Params & { readonly targetModel: NonNullable<T0Lab['targetModel']> };

/** T0 at the same difficulty with wider situations: 1-10 km and either dragonfly hull (calibration only). */
const T0_WIDE: TrainingScenario<T0WideParams> = {
    name: 'T0-wide',
    description: 'GVTS vs one PLAY_DEAD dragonfly-MK1 or -MK2 (calibration only), 1-10 km, any bearing',
    params: fc.record({
        distance: fc.integer({ min: 1000, max: 10000 }),
        bearing: fc.integer({ min: 0, max: 359 }),
        targetModel: fc.constantFrom('dragonfly-MK1' as const, 'dragonfly-MK2' as const),
    }),
    createMap: (params) => createTrainingT0Map(params, { targetModel: params.targetModel }),
};

type T0ConstrainedParams = T0Params & Required<Omit<T0Lab, 'targetModel'>>;

/** T0 with the GVTS starting short of energy and shells, guns already hot (calibration only). */
const T0_CONSTRAINED: TrainingScenario<T0ConstrainedParams> = {
    name: 'T0-constrained',
    description:
        'GVTS starting with 10-30% reactor energy, 250-450 shells per type, chain guns at heat 40-70 (calibration only) vs one PLAY_DEAD dragonfly-MK1, 2-8 km, any bearing',
    params: fc.record({
        distance: fc.integer({ min: 2000, max: 8000 }),
        bearing: fc.integer({ min: 0, max: 359 }),
        playerEnergy: fc.integer({ min: 10, max: 30 }).map((p) => p / 100),
        playerShells: fc.integer({ min: 250, max: 450 }),
        playerGunHeat: fc.integer({ min: 40, max: 70 }),
    }),
    createMap: (params) => createTrainingT0Map(params, params),
};

type T1Calibration = NonNullable<Parameters<typeof createTrainingT1Map>[2]>;

/** T1 with another hull attacking the GVTS -- the TTK ladder's heavier rungs -- or, calibration only, a handicapped target. */
const t1WithHull = (
    name: string,
    model: ShipModel,
    calibration: T1Calibration = {},
    handicap = '',
): TrainingScenario<T0Params> => ({
    ...T1_ATTACKING_DRAGONFLY,
    name,
    description: `GVTS vs one ${model} attacking it${handicap ? ` ${handicap} (calibration only)` : ''}, 2-8 km, any bearing`,
    createMap: (params) => createTrainingT1Map(params, model, calibration),
});

type EnergyBoundParams = T0Params & { readonly playerEnergy: number };

/**
 * T1 against a heavier hull with the GVTS's reactor at a fraction of its output, starting part-charged
 * with one energy cell: a long fight in which the engineer's power budget binds (calibration only).
 */
const energyBound = (name: string, model: ShipModel, reactorOutput: number): TrainingScenario<EnergyBoundParams> => ({
    name,
    description: `GVTS with its reactor at ${reactorOutput * 100}% output, 30-60% energy and one cell, vs one ${model} attacking it (calibration only), 2-8 km, any bearing`,
    params: fc.record({
        distance: fc.integer({ min: 2000, max: 8000 }),
        bearing: fc.integer({ min: 0, max: 359 }),
        playerEnergy: fc.integer({ min: 30, max: 60 }).map((p) => p / 100),
    }),
    createMap: (params) =>
        createTrainingT1Map(params, model, { playerEnergy: params.playerEnergy, playerCells: 1, reactorOutput }),
});

/** Two T1 attackers at once, from different bearings and ranges: target choice and order. */
const T2_TWO_ATTACKERS: TrainingScenario<T2Params> = {
    name: 'T2',
    description: 'GVTS vs two dragonfly-MK1s attacking it, each 2-8 km, the second 45-180 degrees round from the first',
    params: fc.record({
        distance: fc.integer({ min: 2000, max: 8000 }),
        bearing: fc.integer({ min: 0, max: 359 }),
        distance2: fc.integer({ min: 2000, max: 8000 }),
        offset: fc.integer({ min: 45, max: 180 }),
    }),
    createMap: createTrainingT2Map,
    enemies: [TRAINING_TARGET_ID, TRAINING_TARGET2_ID],
};

/** Weapons rung with a threat, a harmless decoy and an ally to choose between (calibration only). */
const W_MULTI: TrainingScenario<WeaponsMultiParams> = {
    name: 'W-multi',
    description:
        'GVTS vs a dragonfly-MK2 attacking it (4-7 km), a PLAY_DEAD unarmed dragonfly-MK1 decoy (3-6 km, 30-90 degrees off) and a PLAY_DEAD allied dragonfly-MK1 600 m off the threat (calibration only)',
    params: fc.record({
        distance: fc.integer({ min: 4000, max: 7000 }),
        bearing: fc.integer({ min: 0, max: 359 }),
        decoyDistance: fc.integer({ min: 3000, max: 6000 }),
        decoyOffset: fc.integer({ min: 30, max: 90 }),
    }),
    createMap: createTrainingWeaponsMultiMap,
};

/** Weapons rung the gun cannot reach: a dragonfly-MK1 fleeing at the GVTS top speed from 10-14 km (calibration only). */
const W_OUTRANGED: TrainingScenario<T0Params> = {
    name: 'W-outranged',
    description: 'GVTS vs a dragonfly-MK1 fleeing at its top speed from 10-14 km, any bearing (calibration only)',
    params: fc.record({
        distance: fc.integer({ min: 10_000, max: 14_000 }),
        bearing: fc.integer({ min: 0, max: 359 }),
    }),
    createMap: createTrainingWeaponsOutrangedMap,
};

export const trainingScenarios: Record<string, TrainingScenario<never>> = {
    T0: T0_PLAY_DEAD_DRAGONFLY as TrainingScenario<never>,
    'T0-wide': T0_WIDE as TrainingScenario<never>,
    'T0-constrained': T0_CONSTRAINED as TrainingScenario<never>,
    T1: T1_ATTACKING_DRAGONFLY as TrainingScenario<never>,
    T2: T2_TWO_ATTACKERS as TrainingScenario<never>,
    'T1-MK2': t1WithHull('T1-MK2', 'dragonfly-MK2') as TrainingScenario<never>,
    'T1-predator': t1WithHull('T1-predator', 'predator') as TrainingScenario<never>,
    'T1-noweave': t1WithHull(
        'T1-noweave',
        'dragonfly-MK1',
        { noCombatWeave: true },
        'without its combat weave',
    ) as TrainingScenario<never>,
    'E1-MK2': energyBound('E1-MK2', 'dragonfly-MK2', 0.5) as TrainingScenario<never>,
    'E1-predator': energyBound('E1-predator', 'predator', 0.5) as TrainingScenario<never>,
    'T1-lite': t1WithHull(
        'T1-lite',
        'dragonfly-MK1',
        { standGround: true, capsuleIntegrity: 0.3 },
        'holding its ground with its capsule 70% breached',
    ) as TrainingScenario<never>,
    'W-multi': W_MULTI as TrainingScenario<never>,
    'W-outranged': W_OUTRANGED as TrainingScenario<never>,
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
    /** Omit to skip persisting the recording -- the run still records to a scratch dir so
     * `extract.ts` has a store to read, but that scratch recording is deleted before returning. */
    readonly recording?: { readonly dir: string; readonly intervalSimSeconds: number };
    /**
     * Seats a crew on the GVTS: it gets `ShipManagerPc`, so the map's `orderAttack` on it is a no-op
     * and, without a {@link beforeTick} driving it, the ship does nothing.
     */
    readonly crewedPlayer?: boolean;
    /**
     * Awaited before every `game.tick(dt)`, as the wave-defence harness drives its crew before the
     * tick, so whatever it sets takes effect on that tick. Cannot cross `run-training.ts`'s worker IPC.
     */
    readonly beforeTick?: (game: HeadlessGame, recorder: HeadlessRecorder) => Promise<void> | void;
}

/**
 * One run: `seed` drives both the fast-check layout sample and the die. `TrainingResult`'s
 * scalars are computed by `analysis/extract.ts` from a recording -- there is exactly one
 * implementation of these metrics, not one inline and one in the analysis CLI. When the caller
 * doesn't ask for a persisted recording, the run still records (at `SCRATCH_INTERVAL_SECONDS`)
 * into a scratch directory that is deleted before returning.
 */
export async function runTraining<P>(
    scenario: TrainingScenario<P>,
    { seed, timeoutSeconds, hz = SERVER_TICK_HZ, recording, crewedPlayer = false, beforeTick }: TrainingRunOptions,
): Promise<TrainingResult> {
    const started = Date.now();
    const [params] = fc.sample(scenario.params, { seed, numRuns: 1 });
    const game = HeadlessGame.start(scenario.createMap(params), seed, { crewedPlayer });
    const gvts = game.api.getShip(TRAINING_PLAYER_ID);
    if (!gvts) {
        throw new Error('GVTS missing');
    }
    const dt = 1 / hz;
    const enemies = scenario.enemies ?? [TRAINING_TARGET_ID];
    const alive = (id: string) => {
        const enemy = game.api.getObject(id);
        return enemy !== undefined && !enemy.destroyed;
    };

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
        await beforeTick?.(game, recorder);
        game.tick(dt);
        await recorder.capture();
        const living = enemies.filter(alive);
        if (!living.length) {
            break;
        }
        const targetObject = game.spaceManager.state.get(living[0]);
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
    const kills = (await Promise.all(enemies.map((id) => killedAt(store, recorder.filePath, id)))).filter(
        (t) => t !== null,
    ).length;
    await store.close();
    const outcome = { ...metrics, killed: kills === enemies.length, kills, enemies: enemies.length };

    const wallSeconds = (Date.now() - started) / 1000;
    if (recording) {
        return {
            scenario: scenario.name,
            seed,
            params,
            ...outcome,
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
        ...outcome,
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
