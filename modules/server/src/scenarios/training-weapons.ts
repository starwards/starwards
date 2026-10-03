import {
    Faction,
    GameMap,
    IdleStrategy,
    Spaceship,
    Vec2,
    XY,
    shellAmmoTypes,
    shipConfigurations,
} from '@starwards/core/internal';
import { T0Params, TRAINING_PLAYER_ID, TRAINING_TARGET_ID } from './training';

/** Calibration only: a fighter capped to the GVTS's own top speed, as the T0 target is. */
const GVTS_MAX_SPEED = shipConfigurations.gravitas.smartPilot.maxSpeed;
export const TRAINING_DECOY_ID = 'decoy';
export const TRAINING_ALLY_ID = 'ally';

/** Layout of the multi-ship weapons rung: the threat, and the bearing offset of the decoy and the ally from it. */
export interface WeaponsMultiParams extends T0Params {
    readonly decoyDistance: number;
    readonly decoyOffset: number;
}

/**
 * Weapons rung with a choice of targets: a dragonfly-MK2 attacking the GVTS (the threat, id `target`), a
 * PLAY_DEAD dragonfly-MK1 with an empty magazine (a decoy that cannot threaten), and a PLAY_DEAD
 * dragonfly-MK1 of the GVTS's own faction (an ally) parked 600 m off the threat's start, in the line of
 * fire. The captain designates the threat: the GVTS starts with it as its weapons target. Calibration
 * only: no real map does this.
 */
export function createTrainingWeaponsMultiMap(params: WeaponsMultiParams): GameMap {
    return {
        name: 'training_weapons_multi',
        init: (game) => {
            const player = game.addPlayerSpaceship(
                new Spaceship().init(TRAINING_PLAYER_ID, new Vec2(0, 0), 'gravitas', Faction.Gravitas),
            );
            const threatAt = XY.byLengthAndDirection(params.distance, params.bearing);
            game.addNpcSpaceship(
                new Spaceship().init(TRAINING_TARGET_ID, Vec2.make(threatAt), 'dragonfly-MK2', Faction.Raiders),
            );
            const decoy = game.addNpcSpaceship(
                new Spaceship().init(
                    TRAINING_DECOY_ID,
                    Vec2.make(XY.byLengthAndDirection(params.decoyDistance, params.bearing + params.decoyOffset)),
                    'dragonfly-MK1',
                    Faction.Raiders,
                ),
            );
            decoy.state.idleStrategy = IdleStrategy.PLAY_DEAD;
            for (const ammo of shellAmmoTypes) decoy.state.magazine[`count_${ammo}`] = 0;
            const ally = game.addNpcSpaceship(
                new Spaceship().init(
                    TRAINING_ALLY_ID,
                    Vec2.make(XY.add(threatAt, XY.byLengthAndDirection(600, params.bearing + 90))),
                    'dragonfly-MK1',
                    Faction.Gravitas,
                ),
            );
            ally.state.idleStrategy = IdleStrategy.PLAY_DEAD;
            game.orderAttack(TRAINING_TARGET_ID, TRAINING_PLAYER_ID);
            game.orderAttack(TRAINING_PLAYER_ID, TRAINING_TARGET_ID);
            // the captain designates the threat: weapons starts locked on it
            player.state.weaponsTarget.targetId = TRAINING_TARGET_ID;
        },
    };
}

/**
 * Weapons rung where the gun is outranged: a dragonfly-MK1 starting `distance` (10-14 km) away and
 * fleeing straight out at the GVTS's own top speed, so the GVTS never closes to its gun's 8 km while
 * a missile, faster than both, can. Calibration only.
 */
export function createTrainingWeaponsOutrangedMap(params: T0Params): GameMap {
    return {
        name: 'training_weapons_outranged',
        init: (game) => {
            game.addPlayerSpaceship(
                new Spaceship().init(TRAINING_PLAYER_ID, new Vec2(0, 0), 'gravitas', Faction.Gravitas),
            );
            const target = game.addNpcSpaceship(
                new Spaceship().init(
                    TRAINING_TARGET_ID,
                    Vec2.make(XY.byLengthAndDirection(params.distance, params.bearing)),
                    'dragonfly-MK1',
                    Faction.Raiders,
                ),
            );
            target.state.smartPilot.design.maxSpeed = GVTS_MAX_SPEED;
            target.state.smartPilot.design.maxSpeedFromAfterBurner = GVTS_MAX_SPEED;
            game.orderMove(TRAINING_TARGET_ID, XY.byLengthAndDirection(1_000_000, params.bearing));
            game.orderAttack(TRAINING_PLAYER_ID, TRAINING_TARGET_ID);
        },
    };
}
