import { AdversaryProfile, applyAdversaryProfile } from '../../scenarios/adversary-profile';
import { DEFAULT_WAVE_TUNING, STATIONS, createWaveDefenceMap } from '../../scenarios/wave-defence';
import { GameApi, GameMap, mulberry32 } from '@starwards/core/internal';

import { HeadlessGame } from '../headless-game';
import { TRAINING_PLAYER_ID } from '../../scenarios/training';
import type { TrainingScenario } from './training-scenarios';
import fc from 'fast-check';

/** How a wave rung went: the pass bar is surviving `passWaves` waves with every station alive. */
export interface WaveOutcome {
    readonly passWaves: number;
    /** Waves whose successor spawned while every station was alive. */
    readonly survived: number;
    /** The latest wave spawned. */
    readonly reached: number;
    readonly stationsLost: number;
    /** Sim-second the first station was lost. */
    readonly firstStationLostAt: number | null;
    /** Raiders that died in combat; a write-off (can't fight, out of play) is not a kill. */
    readonly raidersKilled: number;
    readonly raidersSpawned: number;
    /** GVTS `healthRatio` at the end: the player ship never dies, 0 is a mission kill. */
    readonly gvtsHealth: number;
    /** Sim-second the run passed, or null. */
    readonly passedAt: number | null;
    /** Sim-second the run ended. This and the station damage are absent from older results files. */
    readonly endSeconds?: number;
    /** Capsule integrity lost, summed over the stations (0..3): a lost station counts 1. */
    readonly stationCapsuleLost?: number;
    /** Armor health lost, summed over the stations (0..3): a lost station counts 1. */
    readonly stationArmorLost?: number;
}

/** Wave 1 as the map spawned it: its target station and its raiders. */
export interface FirstWave {
    readonly targetId: string;
    readonly raiderIds: readonly string[];
}

/** Arranges a rung's start after the map's own init (wave 1 already spawned), before the first tick. */
export type WaveSetup = (game: GameApi, wave1: FirstWave) => void;

/** Watches a wave-defence game and decides when its run ends. */
export interface RungTracker {
    /** Read after every tick: true ends the run. */
    done(game: HeadlessGame): boolean;
    outcome(game: HeadlessGame): WaveOutcome;
}

/** A wave rung's layout: only the seed of the map's own wave rng. */
interface WaveRungParams {
    readonly waveSeed: number;
}

/**
 * A training rung on the `wave_defence` map: the GVTS defends the three stations against its raider
 * waves, under the map's own rules except `waveIntervalSeconds`. A run passes once `passWaves` waves
 * are survived with every station alive, and ends there or at the timeout.
 */
export function waveRung({
    name,
    waveIntervalSeconds,
    passWaves,
    adversary,
    firstWave = 1,
    setup,
    description,
}: {
    name: string;
    waveIntervalSeconds: number;
    passWaves: number;
    /** Varies every raider of every wave (adversary rungs); absent leaves the map's own raiders. */
    adversary?: AdversaryProfile;
    /** The map's first spawn is this wave, at its strength. */
    firstWave?: number;
    setup?: WaveSetup;
    description?: string;
}): TrainingScenario<WaveRungParams> {
    const track = ({ waveSeed }: WaveRungParams): { map: GameMap; tracker: RungTracker } => {
        let reached = 0;
        let survived = 0;
        let stationsLost = 0;
        let firstStationLostAt: number | null = null;
        let passedAt: number | null = null;
        const raiders = new Set<string>();
        const writtenOff = new Set<string>();
        const killed = new Set<string>();
        const lost = new Set<string>();
        const varied = new Set<string>();
        let wave1: FirstWave | undefined;
        const waveMap = createWaveDefenceMap(
            mulberry32(waveSeed),
            { ...DEFAULT_WAVE_TUNING, waveIntervalSeconds, firstWave },
            {
                onWaveSpawned: (wave, shipIds, targetId) => {
                    wave1 ??= { targetId, raiderIds: shipIds };
                    if (wave > firstWave && !stationsLost) {
                        survived = wave - firstWave;
                    }
                    reached = wave;
                    shipIds.forEach((id) => raiders.add(id));
                },
                onRaiderWrittenOff: (id) => writtenOff.add(id),
            },
        );
        const map: GameMap = setup
            ? {
                  ...waveMap,
                  init: (game) => {
                      waveMap.init(game);
                      setup(game, wave1!);
                  },
              }
            : waveMap;
        const tracker: RungTracker = {
            done(game) {
                for (const id of raiders) {
                    const raiderState = adversary && !varied.has(id) ? game.api.getShip(id)?.state : undefined;
                    if (adversary && raiderState) {
                        varied.add(id);
                        applyAdversaryProfile(raiderState, adversary);
                    }
                    const raider = game.api.getObject(id);
                    if (!killed.has(id) && !writtenOff.has(id) && (!raider || raider.destroyed)) {
                        killed.add(id);
                    }
                }
                for (const station of STATIONS) {
                    if (!lost.has(station.id) && !game.api.getShip(station.id)) {
                        lost.add(station.id);
                        stationsLost++;
                        firstStationLostAt ??= game.seconds;
                    }
                }
                if (passedAt === null && survived >= passWaves) {
                    passedAt = game.seconds;
                }
                return passedAt !== null || stationsLost === STATIONS.length;
            },
            outcome: (game) => ({
                passWaves,
                survived,
                reached,
                stationsLost,
                firstStationLostAt,
                raidersKilled: killed.size,
                raidersSpawned: raiders.size,
                gvtsHealth: game.api.getShip(TRAINING_PLAYER_ID)?.state.healthRatio ?? 0,
                passedAt,
                endSeconds: game.seconds,
                ...stationDamage(game),
            }),
        };
        return { map, tracker };
    };
    return {
        name,
        description:
            description ??
            `wave_defence: the GVTS defends three stations against raider waves, a wave every ${waveIntervalSeconds} s at most; ${Number.isFinite(passWaves) ? `passes after ${passWaves} waves with every station alive` : 'never passes: counts the waves survived (calibration only)'}`,
        params: fc.record({ waveSeed: fc.integer({ min: 0, max: 2 ** 31 - 1 }) }),
        createMap: (params: WaveRungParams) => track(params).map,
        track,
    };
}

/** Damage the stations took, summed over them; a lost station counts 1 in each. */
export function stationDamage(game: HeadlessGame) {
    let stationCapsuleLost = 0;
    let stationArmorLost = 0;
    for (const { id } of STATIONS) {
        const station = game.api.getShip(id)?.state;
        if (!station) {
            stationCapsuleLost++;
            stationArmorLost++;
            continue;
        }
        stationCapsuleLost += 1 - station.capsule.integrity;
        const plates = station.armor.armorPlates;
        stationArmorLost += plates.length ? 1 - plates.reduce((a, p) => a + p.healthRatio, 0) / plates.length : 0;
    }
    return { stationCapsuleLost, stationArmorLost };
}
