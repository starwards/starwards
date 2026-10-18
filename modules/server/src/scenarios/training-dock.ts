import { Faction, GameMap, Spaceship, Vec2, XY, shipConfigurations } from '@starwards/core/internal';
import { T0Lab, T2Params, createTrainingT2Map } from './training';

/** The allied station of the docking rung (T2-dock). */
export const TRAINING_DOCK_ID = 'dock';

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
    const radius = shipConfigurations['large-station'].radius;
    return {
        name: 'training_t2_dock',
        init: (game) => {
            t2.init(game);
            const position = XY.byLengthAndDirection(params.stationDistance + radius, params.stationBearing);
            game.addNpcSpaceship(
                new Spaceship().init(TRAINING_DOCK_ID, Vec2.make(position), 'large-station', Faction.Gravitas),
            );
        },
    };
}
