import { GameMap, XY } from '@starwards/core/internal';
import { GunnerySample, gunneryFractions, sampleGunnery } from './gunnery-metrics';
import { HeadlessGame, SERVER_TICK_HZ } from '../headless-game';
import { T0Params, TRAINING_PLAYER_ID, TRAINING_TARGET_ID, createTrainingT0Map } from '../../scenarios/training';

import { HeadlessRecorder } from '../headless-recorder';
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
    /** Fraction of sim-time the target was within the GVTS chain gun's `maxShellRange`. */
    readonly inRangeFraction: number;
    /** Fraction of sim-time the GVTS's current aim would put a shell's danger zone on the target. */
    readonly killZoneFraction: number;
    /** Metres the target moved from its spawn point. */
    readonly targetDrift: number;
    /** GVTS speed (m/s) at end. */
    readonly gvtsSpeed: number;
    readonly hz: number;
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

export const trainingScenarios: Record<string, TrainingScenario<never>> = {
    T0: T0_PLAY_DEAD_DRAGONFLY as TrainingScenario<never>,
};

export interface TrainingRunOptions {
    readonly seed: number;
    readonly timeoutSeconds: number;
    readonly hz?: number;
    /** Omit to skip recording. */
    readonly recording?: { readonly dir: string; readonly intervalSimSeconds: number };
}

/** One run: `seed` drives both the fast-check layout sample and the die. */
export async function runTraining<P>(
    scenario: TrainingScenario<P>,
    { seed, timeoutSeconds, hz = SERVER_TICK_HZ, recording }: TrainingRunOptions,
): Promise<TrainingResult> {
    const started = Date.now();
    const [params] = fc.sample(scenario.params, { seed, numRuns: 1 });
    const game = HeadlessGame.start(scenario.createMap(params), seed);
    const recorder = recording
        ? new HeadlessRecorder(
              game,
              recording.dir,
              `${scenario.name}_seed${seed}`,
              recording.intervalSimSeconds,
              params,
              hz,
          )
        : undefined;
    const gvts = game.api.getShip(TRAINING_PLAYER_ID);
    if (!gvts) {
        throw new Error('GVTS missing');
    }
    const shells = () =>
        gvts.state.magazine.count_HiExpShell +
        gvts.state.magazine.count_ArmPenShell +
        gvts.state.magazine.count_FragShell;
    const startShells = shells();
    const targetStart = XY.clone(game.api.getObject(TRAINING_TARGET_ID)?.position ?? XY.zero);
    const dt = 1 / hz;
    let armorStrippedAt: number | null = null;
    let secondsFiring = 0;
    const gunnery: GunnerySample[] = [];
    let targetHealth = 1;
    let targetDrift = 0;
    let killed = false;
    await recorder?.capture();
    while (game.seconds < timeoutSeconds) {
        game.tick(dt);
        await recorder?.capture();
        const target = game.api.getObject(TRAINING_TARGET_ID);
        if (!target || target.destroyed) {
            killed = true;
            targetHealth = 0;
            break;
        }
        const targetShip = game.api.getShip(TRAINING_TARGET_ID);
        if (targetShip) {
            targetHealth = targetShip.state.healthRatio;
            if (armorStrippedAt === null && targetShip.state.armor.armorPlates.every((p) => p.healthRatio <= 0)) {
                armorStrippedAt = game.seconds;
            }
        }
        if (gvts.state.chainGuns.some((g) => g.isFiring)) {
            secondsFiring += dt;
        }
        const targetObject = game.spaceManager.state.get(TRAINING_TARGET_ID);
        if (targetObject) {
            gunnery.push(sampleGunnery(gvts.state, targetObject));
        }
        targetDrift = XY.distance(target.position, targetStart);
    }
    await recorder?.capture(true);
    return {
        scenario: scenario.name,
        seed,
        params,
        killed,
        seconds: game.seconds,
        armorStrippedAt,
        targetHealth,
        shellsFired: startShells - shells(),
        secondsFiring,
        ...gunneryFractions(gunnery),
        targetDrift,
        gvtsSpeed: XY.lengthOf(game.api.getObject(TRAINING_PLAYER_ID)?.velocity ?? XY.zero),
        hz,
        recording: recorder?.filePath,
        frames: recorder?.frameCount,
        wallSeconds: (Date.now() - started) / 1000,
    };
}
