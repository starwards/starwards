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

/**
 * Training rung 1: the T0 target, now fighting -- a dragonfly-MK1 on an ATTACK order against the
 * GVTS, at its own top speed (no cap). A fleeing fighter escapes by design; kills happen while the
 * target engages. The GVTS is non-expendable, so return fire never ends the run.
 */
export function createTrainingT1Map(params: T0Params): GameMap {
    return {
        name: 'training_t1',
        init: (game) => {
            game.addPlayerSpaceship(
                new Spaceship().init(TRAINING_PLAYER_ID, new Vec2(0, 0), 'gravitas', Faction.Gravitas),
            );
            const position = XY.byLengthAndDirection(params.distance, params.bearing);
            game.addNpcSpaceship(
                new Spaceship().init(TRAINING_TARGET_ID, Vec2.make(position), 'dragonfly-MK1', Faction.Raiders),
            );
            game.orderAttack(TRAINING_TARGET_ID, TRAINING_PLAYER_ID);
            game.orderAttack(TRAINING_PLAYER_ID, TRAINING_TARGET_ID);
        },
    };
}

export const training_t1: GameMap = createTrainingT1Map({ distance: 5000, bearing: 0 });

export const TRAINING_DECOY_ID = 'decoy';

/** T1-missile layout: GVTS-to-target `distance` at start, on `bearing` from the decoy to the target. */
export interface T1MissileParams {
    readonly distance: number;
    readonly bearing: number;
    /** Start with the decoy between the GVTS and the target; otherwise it sits off to the side of the GVTS-target line. */
    readonly occluded: boolean;
}

/** Target's start distance from the decoy it attacks: inside its own gun envelope, so it engages at once. */
const T1_MISSILE_TARGET_TO_DECOY = 3000;

/**
 * Training rung T1-missile: a dragonfly-MK1 on an ATTACK order against a friendly decoy (a
 * `small-station`, PLAY_DEAD), with the GVTS standing off 10-15 km. The wave-defence situation:
 * a raider busy on a station, the defender out of its reach. The GVTS gets no order -- the
 * harness drives its tubes.
 */
export function createTrainingT1MissileMap({ distance, bearing, occluded }: T1MissileParams): GameMap {
    return {
        name: 'training_t1_missile',
        init: (game) => {
            const targetPosition = XY.byLengthAndDirection(T1_MISSILE_TARGET_TO_DECOY, bearing);
            const gvtsPosition = occluded
                ? XY.byLengthAndDirection(distance - T1_MISSILE_TARGET_TO_DECOY, bearing + 180)
                : XY.add(targetPosition, XY.byLengthAndDirection(distance, bearing + 90));
            const decoy = game.addNpcSpaceship(
                new Spaceship().init(TRAINING_DECOY_ID, new Vec2(0, 0), 'small-station', Faction.Gravitas),
            );
            decoy.state.idleStrategy = IdleStrategy.PLAY_DEAD;
            game.addPlayerSpaceship(
                new Spaceship().init(TRAINING_PLAYER_ID, Vec2.make(gvtsPosition), 'gravitas', Faction.Gravitas),
            ).state.idleStrategy = IdleStrategy.PLAY_DEAD;
            game.addNpcSpaceship(
                new Spaceship().init(TRAINING_TARGET_ID, Vec2.make(targetPosition), 'dragonfly-MK1', Faction.Raiders),
            );
            game.orderAttack(TRAINING_TARGET_ID, TRAINING_DECOY_ID);
        },
    };
}
