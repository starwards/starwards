import { GameMap, ShipModel, XY } from '@starwards/core/internal';
import { GunnerySample, gunneryFractions, sampleGunnery } from './gunnery-metrics';
import { HeadlessGame, SERVER_TICK_HZ } from '../headless-game';
import {
    T0Params,
    TRAINING_PLAYER_ID,
    TRAINING_TARGET_ID,
    createTrainingT0Map,
    createTrainingT1Map,
} from '../../scenarios/training';

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
    readonly hz: number;
    readonly wallSeconds: number;
}

/** A training rung: a fast-check arbitrary for its layout, and the map built from one sample. */
interface TrainingScenario<P> {
    readonly name: string;
    readonly description: string;
    readonly params: fc.Arbitrary<P>;
    createMap(params: P): GameMap;
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

/** T1 with another hull attacking the GVTS -- the TTK ladder's heavier rungs -- or, calibration only, without its combat weave. */
const t1WithHull = (name: string, model: ShipModel, noCombatWeave = false): TrainingScenario<T0Params> => ({
    ...T1_ATTACKING_DRAGONFLY,
    name,
    description: `GVTS vs one ${model} attacking it${noCombatWeave ? ' without its combat weave (calibration only)' : ''}, 2-8 km, any bearing`,
    createMap: (params) => createTrainingT1Map(params, model, noCombatWeave),
});

export const trainingScenarios: Record<string, TrainingScenario<never>> = {
    T0: T0_PLAY_DEAD_DRAGONFLY as TrainingScenario<never>,
    T1: T1_ATTACKING_DRAGONFLY as TrainingScenario<never>,
    'T1-MK2': t1WithHull('T1-MK2', 'dragonfly-MK2') as TrainingScenario<never>,
    'T1-predator': t1WithHull('T1-predator', 'predator') as TrainingScenario<never>,
    'T1-noweave': t1WithHull('T1-noweave', 'dragonfly-MK1', true) as TrainingScenario<never>,
};

export interface TrainingRunOptions {
    readonly seed: number;
    readonly timeoutSeconds: number;
    readonly hz?: number;
}

/**
 * One run: `seed` drives both the fast-check layout sample and the die. Ends at the kill or at
 * `timeoutSeconds`; every metric is sampled once per tick.
 */
export function runTraining<P>(
    scenario: TrainingScenario<P>,
    { seed, timeoutSeconds, hz = SERVER_TICK_HZ }: TrainingRunOptions,
): TrainingResult {
    const started = Date.now();
    const [params] = fc.sample(scenario.params, { seed, numRuns: 1 });
    const game = HeadlessGame.start(scenario.createMap(params), seed);
    const gvts = game.api.getShip(TRAINING_PLAYER_ID);
    const gvtsObject = game.api.getObject(TRAINING_PLAYER_ID);
    const targetStart = game.api.getObject(TRAINING_TARGET_ID)?.position;
    if (!gvts || !gvtsObject || !targetStart) {
        throw new Error(`${scenario.name}: GVTS or target missing`);
    }
    const { magazine } = gvts.state;
    const shells = () => magazine.count_HiExpShell + magazine.count_ArmPenShell + magazine.count_FragShell;
    const startShells = shells();
    const spawn = XY.clone(targetStart);
    const dt = 1 / hz;
    const gunnery: GunnerySample[] = [];
    let armorStrippedAt: number | null = null;
    let secondsFiring = 0;
    let distanceSum = 0;
    let targetHealth = 1;
    let targetDrift = 0;
    let killed = false;
    while (game.seconds < timeoutSeconds) {
        game.tick(dt);
        const target = game.spaceManager.state.get(TRAINING_TARGET_ID);
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
        distanceSum += XY.distance(target.position, gvtsObject.position);
        targetDrift = XY.distance(target.position, spawn);
        gunnery.push(sampleGunnery(gvts.state, target));
    }
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
        meanDistance: gunnery.length ? distanceSum / gunnery.length : NaN,
        targetDrift,
        gvtsSpeed: XY.lengthOf(gvtsObject.velocity),
        ...gunneryFractions(gunnery),
        hz,
        wallSeconds: (Date.now() - started) / 1000,
    };
}
