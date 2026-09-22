import { Faction, GameMap, IdleStrategy, Spaceship, Vec2, XY, shipConfigurations } from '@starwards/core/internal';

export const TRAINING_PLAYER_ID = 'GVTS';
export const TRAINING_TARGET_ID = 'target';

/** T0 layout: GVTS at the origin, one PLAY_DEAD dragonfly-MK1 at `distance` metres on `bearing` degrees. */
export interface T0Params {
    readonly distance: number;
    readonly bearing: number;
}

/**
 * Lab-only: the target's top speed is capped to the GVTS's own. Blast knock-back otherwise flings
 * the thrustless target to its 600 m/s flight-computer cap, out-running a 450 m/s GVTS, so the
 * rung would measure the chase instead of gunnery. Not a balance change -- no real map does this.
 */
const T0_TARGET_MAX_SPEED = shipConfigurations.gravitas.smartPilot.maxSpeed;

/**
 * Training rung 0: the GVTS is ordered to kill a dragonfly-MK1 that never moves or shoots
 * (PLAY_DEAD, no order). Lab conditions -- no stations, no asteroids, no other ships.
 */
export function createTrainingT0Map(params: T0Params): GameMap {
    return {
        name: 'training_t0',
        init: (game) => {
            game.addPlayerSpaceship(
                new Spaceship().init(TRAINING_PLAYER_ID, new Vec2(0, 0), 'gravitas', Faction.Gravitas),
            );
            const position = XY.byLengthAndDirection(params.distance, params.bearing);
            const target = game.addNpcSpaceship(
                new Spaceship().init(TRAINING_TARGET_ID, Vec2.make(position), 'dragonfly-MK1', Faction.Raiders),
            );
            target.state.idleStrategy = IdleStrategy.PLAY_DEAD;
            target.state.smartPilot.design.maxSpeed = T0_TARGET_MAX_SPEED;
            target.state.smartPilot.design.maxSpeedFromAfterBurner = T0_TARGET_MAX_SPEED;
            game.orderAttack(TRAINING_PLAYER_ID, TRAINING_TARGET_ID);
        },
    };
}

export const training_t0: GameMap = createTrainingT0Map({ distance: 5000, bearing: 0 });

/** T1 layout: as T0, plus the target's course, in degrees, flown for `T1_COURSE_LENGTH` metres. */
export interface T1Params extends T0Params {
    readonly course: number;
}

/** Far enough that the target is still under way when a 300 s run ends at 600 m/s. */
const T1_COURSE_LENGTH = 200_000;

/**
 * Training rung 1: the T0 target, now under way -- a dragonfly-MK1 on a MOVE order along `course`
 * at its own top speed (no cap), still holding fire (PLAY_DEAD). Isolates hitting and killing a
 * thrusting target from being shot at.
 */
export function createTrainingT1Map(params: T1Params): GameMap {
    return {
        name: 'training_t1',
        init: (game) => {
            game.addPlayerSpaceship(
                new Spaceship().init(TRAINING_PLAYER_ID, new Vec2(0, 0), 'gravitas', Faction.Gravitas),
            );
            const position = XY.byLengthAndDirection(params.distance, params.bearing);
            const target = game.addNpcSpaceship(
                new Spaceship().init(TRAINING_TARGET_ID, Vec2.make(position), 'dragonfly-MK1', Faction.Raiders),
            );
            target.state.idleStrategy = IdleStrategy.PLAY_DEAD;
            game.orderMove(
                TRAINING_TARGET_ID,
                XY.add(position, XY.byLengthAndDirection(T1_COURSE_LENGTH, params.course)),
            );
            game.orderAttack(TRAINING_PLAYER_ID, TRAINING_TARGET_ID);
        },
    };
}

export const training_t1: GameMap = createTrainingT1Map({ distance: 5000, bearing: 0, course: 90 });
