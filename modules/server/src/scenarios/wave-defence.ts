import {
    Faction,
    GameApi,
    GameMap,
    PowerLevel,
    ShipModel,
    Spaceship,
    Vec2,
    XY,
    makeId,
} from '@starwards/core/internal';

interface WaveDefenceStation {
    readonly id: string;
    readonly model: ShipModel;
    readonly position: Vec2;
}

export const STATIONS: readonly WaveDefenceStation[] = [
    { id: 'station-large', model: 'large-station', position: new Vec2(0, 34641) },
    { id: 'station-platform', model: 'chaingun-platform', position: new Vec2(30000, -17320) },
    { id: 'station-small', model: 'small-station', position: new Vec2(-30000, -17320) },
];

const WAVE_HULL_SCORES: readonly (readonly [ShipModel, number])[] = [
    ['dragonfly-MK1', 5],
    ['dragonfly-MK2', 8],
    ['predator', 30],
    ['glaive', 35],
    ['cataphract', 50],
];

const WAVE_SPAWN_DISTANCE = 140_000;
const MIN_SPAWN_DISTANCE_FROM_ANY_STATION = 120_000;
const SPAWN_BEARING_SPREAD_DEGREES = 30;
const SPAWN_JITTER_METERS = 300;
const WAVE_CLEAR_DELAY_SECONDS = 15;
const PLAYER_SHIP_ID = 'GVTS';

/** Wave `n`'s points budget: 10, 25, 42, 60, 81, 105, 126, 148, 174, 200 for waves 1-10. */
export function waveBudget(waveNumber: number): number {
    return Math.ceil(waveNumber ** 1.3 * 10);
}

/**
 * Fills a wave's budget by repeatedly picking a random hull whose score is <= the remaining
 * budget and subtracting its score, until nothing affordable remains.
 */
export function generateWaveComposition(waveNumber: number, rng: () => number = Math.random): ShipModel[] {
    let remaining = waveBudget(waveNumber);
    const composition: ShipModel[] = [];
    for (;;) {
        const affordable = WAVE_HULL_SCORES.filter(([, score]) => score <= remaining);
        if (!affordable.length) {
            return composition;
        }
        const [model, score] = affordable[Math.floor(rng() * affordable.length)];
        composition.push(model);
        remaining -= score;
    }
}

/** The alive station furthest from `fromPosition`, e.g. the player ship. */
export function furthestStationId(
    aliveStationIds: readonly string[],
    stationPositions: Readonly<Record<string, XY>>,
    fromPosition: XY,
): string {
    let bestId = aliveStationIds[0];
    let bestDistance = -Infinity;
    for (const id of aliveStationIds) {
        const distance = XY.lengthOf(XY.difference(stationPositions[id], fromPosition));
        if (distance > bestDistance) {
            bestDistance = distance;
            bestId = id;
        }
    }
    return bestId;
}

const ROUND_ROBIN_TARGET_BY_MODULO: Readonly<Record<number, string>> = {
    0: 'station-small',
    1: 'station-large',
    2: 'station-platform',
};

/** Waves 1-3: strict round-robin, large -> platform -> small. Wave 4 onward: furthest from the player. */
export function pickWaveTargetStationId(
    waveNumber: number,
    aliveStationIds: readonly string[],
    stationPositions: Readonly<Record<string, XY>>,
    playerPosition: XY,
): string {
    if (waveNumber <= 3) {
        const roundRobinTarget = ROUND_ROBIN_TARGET_BY_MODULO[waveNumber % 3];
        if (aliveStationIds.includes(roundRobinTarget)) {
            return roundRobinTarget;
        }
    }
    return furthestStationId(aliveStationIds, stationPositions, playerPosition);
}

/**
 * A point 140,000m from `targetStationPosition`, on a bearing sampled within +-30 degrees of the
 * outward radial from the formation centroid (the origin) through that station. Resamples until
 * the point is also >=120,000m from every station in `allStationPositions`.
 */
export function sampleWaveSpawnCenter(
    targetStationPosition: XY,
    allStationPositions: readonly XY[],
    rng: () => number = Math.random,
): Vec2 {
    const radialDegrees = XY.angleOf(targetStationPosition);
    for (let attempt = 0; attempt < 1000; attempt++) {
        const bearing = radialDegrees + (rng() * 2 - 1) * SPAWN_BEARING_SPREAD_DEGREES;
        const candidate = XY.add(targetStationPosition, XY.byLengthAndDirection(WAVE_SPAWN_DISTANCE, bearing));
        const farEnoughFromEveryStation = allStationPositions.every(
            (station) => XY.lengthOf(XY.difference(candidate, station)) >= MIN_SPAWN_DISTANCE_FROM_ANY_STATION,
        );
        if (farEnoughFromEveryStation) {
            return Vec2.make(candidate);
        }
    }
    throw new Error('wave-defence: could not find a spawn point >=120,000m from every station');
}

const stationPositionsById: Readonly<Record<string, XY>> = Object.fromEntries(
    STATIONS.map((station) => [station.id, station.position]),
);
const allStationPositions = STATIONS.map((station) => station.position);

/**
 * Endless wave-defence scenario: three friendly stations the crew must defend against
 * procedurally generated raider waves. `rng` is injectable for deterministic tests; production
 * play uses `Math.random`.
 */
export function createWaveDefenceMap(rng: () => number = Math.random): GameMap {
    let game: GameApi;
    let waveNumber = 0;
    let currentWaveShipIds: string[] = [];
    let waveClearTimer: number | null = null;
    let defeated = false;

    function aliveStationIds(): string[] {
        return STATIONS.filter((station) => !!game.getShip(station.id)).map((station) => station.id);
    }

    function spawnWave() {
        waveNumber += 1;
        const alive = aliveStationIds();
        const playerPosition = game.getObject(PLAYER_SHIP_ID)?.position ?? XY.zero;
        const targetId = pickWaveTargetStationId(waveNumber, alive, stationPositionsById, playerPosition);
        const spawnCenter = sampleWaveSpawnCenter(stationPositionsById[targetId], allStationPositions, rng);

        currentWaveShipIds = generateWaveComposition(waveNumber, rng).map((model) => {
            const id = makeId();
            const jitter = XY.byLengthAndDirection(rng() * SPAWN_JITTER_METERS, rng() * 360);
            const ship = new Spaceship().init(id, Vec2.make(XY.add(spawnCenter, jitter)), model, Faction.Raiders);
            game.addNpcSpaceship(ship);
            game.orderAttack(id, targetId);
            return id;
        });
        waveClearTimer = null;
    }

    return {
        name: 'wave_defence',
        init: (g) => {
            game = g;
            game.addPlayerSpaceship(new Spaceship().init(PLAYER_SHIP_ID, new Vec2(0, 0), 'gravitas', Faction.Gravitas));
            for (const station of STATIONS) {
                const stationShip = new Spaceship().init(
                    station.id,
                    Vec2.make(station.position),
                    station.model,
                    Faction.Gravitas,
                );
                // Anchored structures (their smart pilot already caps maxSpeed at 0) must stay put
                // even when hit: without this, a chain-gun impact's blast-physics kick can fling a
                // station across the map, which then makes the attacking raider's automation chase
                // its now-wildly-moving velocity and fly off in pursuit instead of holding orbit
                // (issue #2092).
                stationShip.freeze = true;
                const stationApi = game.addNpcSpaceship(stationShip);
                // Stations have no engineer to raise power off the idle default, so radar range
                // (which scales with sqrt(effectiveness)) would otherwise sit at ~71% of design
                // range forever -- short of the 120km line this map's spawn distances assume.
                // Scenario-local per the #2084 design redirect: other maps/NPCs keep the default.
                for (const radar of stationApi.state.radars) {
                    radar.power = PowerLevel.MAX;
                }
            }
            spawnWave();
        },
        update: (deltaSeconds) => {
            if (defeated || deltaSeconds <= 0) {
                return;
            }

            const alive = aliveStationIds();
            if (!alive.length) {
                game.setMessage(`Defeat: every station was lost during wave ${waveNumber}.`);
                game.setSpeed(0);
                defeated = true;
                return;
            }

            const playerPosition = game.getObject(PLAYER_SHIP_ID)?.position;
            if (playerPosition) {
                for (const shipId of currentWaveShipIds) {
                    const shipApi = game.getShip(shipId);
                    if (!shipApi) {
                        continue;
                    }
                    const targetId = shipApi.state.orderTargetId;
                    const targetObject = targetId ? game.getObject(targetId) : undefined;
                    if (!targetId || !targetObject || targetObject.destroyed) {
                        game.orderAttack(shipId, furthestStationId(alive, stationPositionsById, playerPosition));
                    }
                }
            }

            const waveHasSurvivors = currentWaveShipIds.some((id) => {
                const object = game.getObject(id);
                return object && !object.destroyed;
            });
            if (!waveHasSurvivors) {
                waveClearTimer = (waveClearTimer ?? 0) + deltaSeconds;
                if (waveClearTimer >= WAVE_CLEAR_DELAY_SECONDS) {
                    spawnWave();
                }
            }
        },
    };
}

export const wave_defence: GameMap = createWaveDefenceMap();
