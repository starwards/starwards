import { Faction, GameApi, GameMap, Spaceship, Vec2, XY, shipConfigurations } from '@starwards/core/internal';
import {
    T0Lab,
    T2Params,
    TRAINING_PLAYER_ID,
    TRAINING_TARGET_ID,
    addConstrainedPlayer,
    createTrainingT2Map,
} from './training';
import { DOCK_ONLY_MAP_NAME } from './dock-only-map-name';

/** The allied station of the docking rung (T2-dock). */
export const TRAINING_DOCK_ID = 'dock';

/** Adds the allied large station `distance` metres (surface) from the GVTS on `bearing` degrees. */
function addDockStation(game: GameApi, distance: number, bearing: number): void {
    const radius = shipConfigurations['large-station'].radius;
    game.addNpcSpaceship(
        new Spaceship().init(
            TRAINING_DOCK_ID,
            Vec2.make(XY.byLengthAndDirection(distance + radius, bearing)),
            'large-station',
            Faction.Gravitas,
        ),
    );
}

/** T2-dock layout: the T2 attackers, and an allied station `stationDistance` metres (surface) from the GVTS on `stationBearing`. */
export interface T2DockParams extends T2Params {
    readonly stationDistance: number;
    readonly stationBearing: number;
}

/**
 * Training rung with a mission choice: the constrained T2 fight next to an allied large station the
 * GVTS can dock at, where it restocks its magazine and energy cells and may run docked-tier repairs.
 * The station has no weapons, so docking buys supplies and repairs, never cover. Calibration only.
 */
export function createTrainingT2DockMap(params: T2DockParams, constraints: Omit<T0Lab, 'targetModel'>): GameMap {
    const t2 = createTrainingT2Map(params, constraints);
    return {
        name: 'training_t2_dock',
        init: (game) => {
            t2.init(game);
            addDockStation(game, params.stationDistance, params.stationBearing);
        },
    };
}

/** Dock-only layout: the allied station as on {@link T2DockParams}, and optionally one attacker `attackerDistance` metres from the GVTS. */
export interface DockOnlyParams {
    readonly stationDistance: number;
    readonly stationBearing: number;
    /** When set, a dragonfly-MK1 starts this far from the GVTS on the bearing opposite the station, ordered to attack it. */
    readonly attackerDistance?: number;
}

/**
 * Dock-only rung: the GVTS starts constrained per `constraints` (typically {@link T0Lab.playerArmor}) beside an allied large
 * station, with no attackers unless `attackerDistance` sets one far enough to arrive late. Calibration only.
 */
export function createTrainingDockOnlyMap(
    { stationDistance, stationBearing, attackerDistance }: DockOnlyParams,
    constraints: Omit<T0Lab, 'targetModel'> = {},
): GameMap {
    return {
        name: DOCK_ONLY_MAP_NAME,
        init: (game) => {
            addConstrainedPlayer(game, constraints);
            addDockStation(game, stationDistance, stationBearing);
            if (attackerDistance !== undefined) {
                game.addNpcSpaceship(
                    new Spaceship().init(
                        TRAINING_TARGET_ID,
                        Vec2.make(XY.byLengthAndDirection(attackerDistance, stationBearing + 180)),
                        'dragonfly-MK1',
                        Faction.Raiders,
                    ),
                );
                game.orderAttack(TRAINING_TARGET_ID, TRAINING_PLAYER_ID);
            }
        },
    };
}
