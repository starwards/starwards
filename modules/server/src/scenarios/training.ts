import {
    Faction,
    GameMap,
    IdleStrategy,
    ShipModel,
    Spaceship,
    Vec2,
    XY,
    shellAmmoTypes,
    shipConfigurations,
} from '@starwards/core/internal';

export const TRAINING_PLAYER_ID = 'GVTS';
export const TRAINING_TARGET_ID = 'target';

/** T0 layout: GVTS at the origin, one PLAY_DEAD dragonfly-MK1 at `distance` metres on `bearing` degrees. */
export interface T0Params {
    readonly distance: number;
    readonly bearing: number;
}

/**
 * Calibration only, not a game config: the target's top speed is capped to the GVTS's own. Blast knock-back otherwise flings
 * the thrustless target to its 600 m/s flight-computer cap, out-running a 450 m/s GVTS, so the
 * rung would measure the chase instead of gunnery. Not a balance change -- no real map does this.
 */
const T0_TARGET_MAX_SPEED = shipConfigurations.gravitas.smartPilot.maxSpeed;

/**
 * Calibration only, not game configs: the curriculum's T0 variants. `targetModel` swaps the hull
 * (default dragonfly-MK1); the rest start the GVTS constrained -- `playerEnergy`, reactor energy as a
 * share of its maximum; `playerShells`, rounds of every shell type in the magazine (capped at its
 * capacity); `playerGunHeat`, every chain gun's starting heat (0..100).
 */
export interface T0Lab {
    readonly targetModel?: ShipModel;
    readonly playerEnergy?: number;
    readonly playerShells?: number;
    readonly playerGunHeat?: number;
}

/**
 * Training rung 0: the GVTS is ordered to kill a dragonfly-MK1 that never moves or shoots
 * (PLAY_DEAD, no order). Lab conditions -- no stations, no asteroids, no other ships.
 */
export function createTrainingT0Map(
    params: T0Params,
    { targetModel = 'dragonfly-MK1', playerEnergy, playerShells, playerGunHeat }: T0Lab = {},
): GameMap {
    return {
        name: 'training_t0',
        init: (game) => {
            const player = game.addPlayerSpaceship(
                new Spaceship().init(TRAINING_PLAYER_ID, new Vec2(0, 0), 'gravitas', Faction.Gravitas),
            ).state;
            if (playerEnergy !== undefined) {
                player.reactor.energy = playerEnergy * player.reactor.design.maxEnergy;
            }
            if (playerShells !== undefined) {
                for (const ammo of shellAmmoTypes) {
                    player.magazine[`count_${ammo}`] = Math.min(playerShells, player.magazine.design[`max_${ammo}`]);
                }
            }
            if (playerGunHeat !== undefined) {
                for (const gun of player.chainGuns) {
                    gun.heat = playerGunHeat;
                }
            }
            const position = XY.byLengthAndDirection(params.distance, params.bearing);
            const target = game.addNpcSpaceship(
                new Spaceship().init(TRAINING_TARGET_ID, Vec2.make(position), targetModel, Faction.Raiders),
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
 * Training rung 1: the T0 target, now fighting -- a `targetModel` (default dragonfly-MK1) on an
 * ATTACK order against the GVTS, at its own top speed (no cap). A fleeing fighter escapes by design;
 * kills happen while the target engages. The GVTS is non-expendable, so return fire never ends the run.
 */
export function createTrainingT1Map(
    params: T0Params,
    targetModel: ShipModel = 'dragonfly-MK1',
    /**
     * Calibration only, not game configs: `noCombatWeave`, the target attacks without its combat weave
     * (`ShipState.labNoCombatWeave`); `standGround`, the target holds its position and fires at the GVTS
     * instead of attacking it (no order, `IdleStrategy.STAND_GROUND`), capped to the GVTS's top speed as on T0; `capsuleIntegrity`, the target's capsule starts this
     * damaged (1 intact), so fewer internal hits kill it.
     */
    {
        noCombatWeave = false,
        standGround = false,
        capsuleIntegrity = 1,
    }: { noCombatWeave?: boolean; standGround?: boolean; capsuleIntegrity?: number } = {},
): GameMap {
    return {
        name: 'training_t1',
        init: (game) => {
            game.addPlayerSpaceship(
                new Spaceship().init(TRAINING_PLAYER_ID, new Vec2(0, 0), 'gravitas', Faction.Gravitas),
            );
            const position = XY.byLengthAndDirection(params.distance, params.bearing);
            const target = game.addNpcSpaceship(
                new Spaceship().init(TRAINING_TARGET_ID, Vec2.make(position), targetModel, Faction.Raiders),
            );
            target.state.labNoCombatWeave = noCombatWeave;
            target.state.capsule.integrity = capsuleIntegrity;
            if (standGround) {
                target.state.idleStrategy = IdleStrategy.STAND_GROUND;
                target.state.smartPilot.design.maxSpeed = T0_TARGET_MAX_SPEED;
                target.state.smartPilot.design.maxSpeedFromAfterBurner = T0_TARGET_MAX_SPEED;
            } else {
                game.orderAttack(TRAINING_TARGET_ID, TRAINING_PLAYER_ID);
            }
            game.orderAttack(TRAINING_PLAYER_ID, TRAINING_TARGET_ID);
        },
    };
}

export const training_t1: GameMap = createTrainingT1Map({ distance: 5000, bearing: 0 });
