import { Faction, GameMap, ShipModel, Spaceship, Vec2, XY } from '@starwards/core/internal';

const TRAINING_PLAYER_ID = 'GVTS';
export const TRAINING_TARGET_ID = 'target';

/** T1 layout: GVTS at the origin, the target at `distance` metres on `bearing` degrees. */
export interface T1Params {
    readonly distance: number;
    readonly bearing: number;
}

/**
 * Training rung 1: a `targetModel` (default dragonfly-MK1) on an ATTACK order against the GVTS, at
 * its own top speed, and the GVTS on an ATTACK order against it. Lab conditions -- no stations, no
 * asteroids, no other ships. A fleeing fighter escapes by design; kills happen while the target
 * engages. The GVTS is non-expendable, so return fire never ends the run.
 */
export function createTrainingT1Map(params: T1Params, targetModel: ShipModel = 'dragonfly-MK1'): GameMap {
    return {
        name: 'training_t1',
        init: (game) => {
            game.addPlayerSpaceship(
                new Spaceship().init(TRAINING_PLAYER_ID, new Vec2(0, 0), 'gravitas', Faction.Gravitas),
            );
            const position = XY.byLengthAndDirection(params.distance, params.bearing);
            game.addNpcSpaceship(
                new Spaceship().init(TRAINING_TARGET_ID, Vec2.make(position), targetModel, Faction.Raiders),
            );
            game.orderAttack(TRAINING_TARGET_ID, TRAINING_PLAYER_ID);
            game.orderAttack(TRAINING_PLAYER_ID, TRAINING_TARGET_ID);
        },
    };
}
