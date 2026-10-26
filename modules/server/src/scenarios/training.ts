import {
    Faction,
    FlightDoctrine,
    GameMap,
    IdleStrategy,
    ScanLevel,
    ShipModel,
    ShipState,
    Spaceship,
    TODAY_NPC_AI,
    Vec2,
    XY,
    magazineStocks,
    shellAmmoTypes,
    shipConfigurations,
} from '@starwards/core/internal';

export const TRAINING_PLAYER_ID = 'GVTS';
export const TRAINING_TARGET_ID = 'target';
/** The second attacker on the multi-enemy rung (T2). */
export const TRAINING_TARGET2_ID = 'target2';

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
    /** Missiles in each missile stock of the magazine, capped at the hull's maximum. */
    readonly playerMissiles?: number;
    /** Healthy armor plates the GVTS starts with; the rest start broken. Default: every plate healthy. */
    readonly playerArmor?: number;
}

/** Starts the GVTS short of energy and shells with hot guns, per the given {@link T0Lab} fields. */
export function constrainPlayer(
    player: ShipState,
    { playerEnergy, playerShells, playerGunHeat, playerMissiles, playerArmor }: Omit<T0Lab, 'targetModel'>,
): void {
    if (playerEnergy !== undefined) {
        player.reactor.energy = playerEnergy * player.reactor.design.maxEnergy;
    }
    if (playerShells !== undefined) {
        for (const ammo of shellAmmoTypes) {
            player.magazine[`count_${ammo}`] = Math.min(playerShells, player.magazine.design[`max_${ammo}`]);
        }
    }
    if (playerMissiles !== undefined) {
        for (const stock of magazineStocks.filter((s) => s.endsWith('Missile'))) {
            player.magazine[`count_${stock}`] = Math.min(playerMissiles, player.magazine.design[`max_${stock}`]);
        }
    }
    if (playerGunHeat !== undefined) {
        for (const gun of player.chainGuns) {
            gun.heat = playerGunHeat;
        }
    }
    if (playerArmor !== undefined) {
        player.armor.armorPlates.forEach((plate, index) => {
            if (index >= playerArmor) {
                for (const layer of plate.layers) {
                    layer.health = 0;
                }
            }
        });
    }
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
            constrainPlayer(
                game.addPlayerSpaceship(
                    new Spaceship().init(TRAINING_PLAYER_ID, new Vec2(0, 0), 'gravitas', Faction.Gravitas),
                ).state,
                { playerEnergy, playerShells, playerGunHeat },
            );
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
     * (`NpcAiProfile.noCombatWeave`); `standGround`, the target holds its position and fires at the GVTS
     * instead of attacking it (no order, `IdleStrategy.STAND_GROUND`), capped to the GVTS's top speed as on T0; `capsuleIntegrity`, the target's capsule starts this
     * damaged (1 intact), so fewer internal hits kill it. `playerEnergy` (share of the store),
     * `playerCells` and `reactorOutput` (factor on the GVTS reactor's energy per second) start the GVTS
     * short of energy, so the engineer's power budget binds.
     */
    {
        noCombatWeave = false,
        standGround = false,
        flightDoctrine,
        capsuleIntegrity = 1,
        playerEnergy,
        playerCells,
        reactorOutput,
    }: {
        noCombatWeave?: boolean;
        standGround?: boolean;
        /** The target's flight doctrine override (adversary rungs); absent keeps the order's default. */
        flightDoctrine?: FlightDoctrine;
        capsuleIntegrity?: number;
        playerEnergy?: number;
        playerCells?: number;
        reactorOutput?: number;
    } = {},
): GameMap {
    return {
        name: 'training_t1',
        init: (game) => {
            const reactor = game.addPlayerSpaceship(
                new Spaceship().init(TRAINING_PLAYER_ID, new Vec2(0, 0), 'gravitas', Faction.Gravitas),
            ).state.reactor;
            if (playerEnergy !== undefined) {
                reactor.energy = playerEnergy * reactor.design.maxEnergy;
            }
            if (playerCells !== undefined) {
                reactor.energyCells = playerCells;
            }
            if (reactorOutput !== undefined) {
                reactor.design.energyPerSecond *= reactorOutput;
            }
            const position = XY.byLengthAndDirection(params.distance, params.bearing);
            const target = game.addNpcSpaceship(
                new Spaceship().init(TRAINING_TARGET_ID, Vec2.make(position), targetModel, Faction.Raiders),
            );
            target.state.aiProfile = { ...TODAY_NPC_AI, noCombatWeave };
            if (flightDoctrine !== undefined) {
                target.state.flightDoctrine = flightDoctrine;
            }
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

/** T2 layout: the T1 attacker at `distance`/`bearing`, a second one at `distance2` metres, `offset` degrees round from it. */
export interface T2Params extends T0Params {
    readonly distance2: number;
    readonly offset: number;
}

/**
 * Training rung 2: two T1 attackers at once -- dragonfly-MK1s on ATTACK orders against the GVTS from
 * different bearings and ranges, so the crew chooses which to fight first. The GVTS starts ordered to
 * attack the first; uncrewed, its automation reacquires the nearest hostile when that one dies.
 */
export function createTrainingT2Map(
    params: T2Params,
    /** Calibration only: start the GVTS constrained, as on `T0-constrained` (see {@link T0Lab}). */
    constraints: Omit<T0Lab, 'targetModel'> = {},
): GameMap {
    return {
        name: 'training_t2',
        init: (game) => {
            constrainPlayer(
                game.addPlayerSpaceship(
                    new Spaceship().init(TRAINING_PLAYER_ID, new Vec2(0, 0), 'gravitas', Faction.Gravitas),
                ).state,
                constraints,
            );
            const layout: [string, XY][] = [
                [TRAINING_TARGET_ID, XY.byLengthAndDirection(params.distance, params.bearing)],
                [TRAINING_TARGET2_ID, XY.byLengthAndDirection(params.distance2, params.bearing + params.offset)],
            ];
            for (const [id, position] of layout) {
                game.addNpcSpaceship(new Spaceship().init(id, Vec2.make(position), 'dragonfly-MK1', Faction.Raiders));
                game.orderAttack(id, TRAINING_PLAYER_ID);
            }
            game.orderAttack(TRAINING_PLAYER_ID, TRAINING_TARGET_ID);
        },
    };
}

/** The allied station of the directed rung (T3-directed). */
const TRAINING_STATION_ID = 'station';

/**
 * T3-directed layout: the target at `distance` metres on `bearing` degrees from the GVTS, and the
 * allied station `stationDistance` metres from the target, `stationBearing` degrees round it.
 */
export interface T3DirectedParams extends T0Params {
    readonly stationDistance: number;
    readonly stationBearing: number;
}

/**
 * Training rung 3, directed: the T0 target far beyond the GVTS's own radar, where only an allied
 * large station's radar sees it. The station has identified it (BASIC scan for the GVTS's faction),
 * and the GVTS starts facing away from it, so at the start the crew knows of the target only through
 * the fleet's picture.
 */
export function createTrainingT3DirectedMap(params: T3DirectedParams): GameMap {
    return {
        name: 'training_t3_directed',
        init: (game) => {
            const gvts = new Spaceship().init(TRAINING_PLAYER_ID, new Vec2(0, 0), 'gravitas', Faction.Gravitas);
            gvts.angle = params.bearing + 180;
            game.addPlayerSpaceship(gvts);
            const position = XY.byLengthAndDirection(params.distance, params.bearing);
            const targetShip = new Spaceship().init(
                TRAINING_TARGET_ID,
                Vec2.make(position),
                'dragonfly-MK1',
                Faction.Raiders,
            );
            targetShip.scanLevels[Faction.Gravitas] = ScanLevel.BASIC;
            const target = game.addNpcSpaceship(targetShip);
            target.state.idleStrategy = IdleStrategy.PLAY_DEAD;
            target.state.smartPilot.design.maxSpeed = T0_TARGET_MAX_SPEED;
            target.state.smartPilot.design.maxSpeedFromAfterBurner = T0_TARGET_MAX_SPEED;
            const station = XY.add(position, XY.byLengthAndDirection(params.stationDistance, params.stationBearing));
            game.addNpcSpaceship(
                new Spaceship().init(TRAINING_STATION_ID, Vec2.make(station), 'large-station', Faction.Gravitas),
            );
        },
    };
}

/**
 * T3-incoming layout: the raider at `distance` metres on `bearing` degrees from the GVTS, and the
 * allied station `stationDistance` metres from the raider, `stationOffset` degrees off the raider's
 * line to the GVTS.
 */
export interface T3IncomingParams extends T0Params {
    readonly stationDistance: number;
    readonly stationOffset: number;
}

/**
 * Training rung 3, incoming: a dragonfly-MK1 on an ATTACK order against the GVTS, starting far beyond
 * the GVTS's own radar, where only an allied large station near its start sees it. The station has
 * identified it (BASIC scan for the GVTS's faction), and the GVTS starts facing away from it, so the
 * crew first learns of the raider from the fleet's picture while it flies straight in.
 */
export function createTrainingT3IncomingMap(params: T3IncomingParams): GameMap {
    return {
        name: 'training_t3_incoming',
        init: (game) => {
            const gvts = new Spaceship().init(TRAINING_PLAYER_ID, new Vec2(0, 0), 'gravitas', Faction.Gravitas);
            gvts.angle = params.bearing + 180;
            game.addPlayerSpaceship(gvts);
            const position = XY.byLengthAndDirection(params.distance, params.bearing);
            const raider = new Spaceship().init(
                TRAINING_TARGET_ID,
                Vec2.make(position),
                'dragonfly-MK1',
                Faction.Raiders,
            );
            raider.scanLevels[Faction.Gravitas] = ScanLevel.BASIC;
            game.addNpcSpaceship(raider);
            const station = XY.add(
                position,
                XY.byLengthAndDirection(params.stationDistance, params.bearing + 180 + params.stationOffset),
            );
            game.addNpcSpaceship(
                new Spaceship().init(TRAINING_STATION_ID, Vec2.make(station), 'large-station', Faction.Gravitas),
            );
            game.orderAttack(TRAINING_TARGET_ID, TRAINING_PLAYER_ID);
        },
    };
}
