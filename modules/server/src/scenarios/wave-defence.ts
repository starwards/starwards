import {
    Faction,
    GameApi,
    GameMap,
    IdleStrategy,
    PowerLevel,
    ShipModel,
    Spaceship,
    Vec2,
    XY,
    ammoTypes,
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

/** Continuous seconds a raider must be unable to fight (every chain gun broken, or magazine empty of every ammo type) before it's written off as gone (issue #2233). */
export const CANT_FIGHT_SECONDS = 30;
/** Continuous seconds a raider must sit beyond `OUT_OF_PLAY_DISTANCE_METERS` from every alive station, receding or stationary, before it's written off as gone (issue #2233). */
export const OUT_OF_PLAY_SECONDS = 60;
/** Distance from every alive station beyond which a receding/stationary raider starts the out-of-play clock (issue #2233). */
export const OUT_OF_PLAY_DISTANCE_METERS = 200_000;
/** Hard ceiling on how long a wave can hold up progression: this many seconds after a wave spawns, the next one spawns regardless of the current wave's state (issue #2233). Waves may overlap. */
export const WAVE_INTERVAL_SECONDS = 480;

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
        const distance = XY.distance(stationPositions[id], fromPosition);
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
            (station) => XY.distance(candidate, station) >= MIN_SPAWN_DISTANCE_FROM_ANY_STATION,
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
    /** Every wave still holding at least one not-yet-gone raider; older waves are dropped once fully gone. */
    let liveWaves: { shipIds: string[] }[] = [];
    /** The most recently spawned wave's raider ids -- its clear-state alone drives `waveClearTimer` (waves may overlap; an older wave clearing late triggers nothing). */
    let latestWaveShipIds: string[] = [];
    let waveClearTimer: number | null = null;
    /** Seconds since `latestWaveShipIds` spawned; crossing `WAVE_INTERVAL_SECONDS` spawns the next wave regardless of clear state. */
    let secondsSinceLatestSpawn = 0;
    let defeated = false;
    /** Per-raider continuous "can't fight" streak, reset the moment it can fight again. */
    const cantFightSeconds = new Map<string, number>();
    /** Per-raider continuous "receding/stationary beyond range" streak and the distance it was last measured at. */
    const outOfPlay = new Map<string, { seconds: number; lastMinDistance: number }>();

    function aliveStationIds(): string[] {
        return STATIONS.filter((station) => !!game.getShip(station.id)).map((station) => station.id);
    }

    function isRaiderGone(id: string): boolean {
        const object = game.getObject(id);
        return !object || object.destroyed;
    }

    function forgetRaider(id: string) {
        cantFightSeconds.delete(id);
        outOfPlay.delete(id);
    }

    /** Evaluates the two #2233 "gone" predicates for one still-live raider and converts it to a Derelict if either trips. */
    function evaluateIncapacitation(id: string, deltaSeconds: number, aliveIds: readonly string[]) {
        if (isRaiderGone(id)) {
            forgetRaider(id);
            return;
        }
        const shipApi = game.getShip(id);
        if (!shipApi) {
            forgetRaider(id);
            return;
        }

        const cantFight =
            shipApi.state.chainGuns.every((gun) => gun.broken) ||
            ammoTypes.every((ammoType) => shipApi.state.magazine.getCount(ammoType) === 0);
        if (cantFight) {
            const seconds = (cantFightSeconds.get(id) ?? 0) + deltaSeconds;
            if (seconds >= CANT_FIGHT_SECONDS) {
                game.convertToDerelict(id);
                forgetRaider(id);
                return;
            }
            cantFightSeconds.set(id, seconds);
        } else {
            cantFightSeconds.delete(id);
        }

        const position = game.getObject(id)?.position;
        if (!position || !aliveIds.length) {
            return;
        }
        const minDistance = Math.min(...aliveIds.map((sid) => XY.distance(position, stationPositionsById[sid])));
        if (minDistance > OUT_OF_PLAY_DISTANCE_METERS) {
            const previous = outOfPlay.get(id);
            const seconds =
                previous && minDistance >= previous.lastMinDistance - 1e-6
                    ? previous.seconds + deltaSeconds
                    : deltaSeconds;
            if (seconds >= OUT_OF_PLAY_SECONDS) {
                game.convertToDerelict(id);
                forgetRaider(id);
                return;
            }
            outOfPlay.set(id, { seconds, lastMinDistance: minDistance });
        } else {
            outOfPlay.delete(id);
        }
    }

    function spawnWave() {
        waveNumber += 1;
        const alive = aliveStationIds();
        const playerPosition = game.getObject(PLAYER_SHIP_ID)?.position ?? XY.zero;
        const targetId = pickWaveTargetStationId(waveNumber, alive, stationPositionsById, playerPosition);
        const spawnCenter = sampleWaveSpawnCenter(stationPositionsById[targetId], allStationPositions, rng);

        const shipIds = generateWaveComposition(waveNumber, rng).map((model) => {
            const id = makeId();
            const jitter = XY.byLengthAndDirection(rng() * SPAWN_JITTER_METERS, rng() * 360);
            const ship = new Spaceship().init(id, Vec2.make(XY.add(spawnCenter, jitter)), model, Faction.Raiders);
            game.addNpcSpaceship(ship);
            game.orderAttack(id, targetId);
            return id;
        });
        liveWaves.push({ shipIds });
        latestWaveShipIds = shipIds;
        waveClearTimer = null;
        secondsSinceLatestSpawn = 0;
    }

    return {
        name: 'wave_defence',
        init: (g) => {
            game = g;
            game.addPlayerSpaceship(new Spaceship().init(PLAYER_SHIP_ID, new Vec2(0, 0), 'gravitas', Faction.Gravitas));
            for (const station of STATIONS) {
                const stationApi = game.addNpcSpaceship(
                    new Spaceship().init(station.id, Vec2.make(station.position), station.model, Faction.Gravitas),
                );
                // Stations have no engineer to raise power off the idle default, so radar range
                // (which scales with sqrt(effectiveness)) would otherwise sit at ~71% of design
                // range forever -- short of the 120km line this map's spawn distances assume.
                // Scenario-local per the #2084 design redirect: other maps/NPCs keep the default.
                for (const radar of stationApi.state.radars) {
                    radar.power = PowerLevel.MAX;
                }
                // Stations never receive an order, so without this the default (PLAY_DEAD) leaves
                // their chain gun silent against raiders passing in range.
                stationApi.state.idleStrategy = IdleStrategy.STAND_GROUND;
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

            const allLiveShipIds = liveWaves.flatMap((wave) => wave.shipIds);

            const playerPosition = game.getObject(PLAYER_SHIP_ID)?.position;
            if (playerPosition) {
                for (const shipId of allLiveShipIds) {
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

            for (const shipId of allLiveShipIds) {
                evaluateIncapacitation(shipId, deltaSeconds, alive);
            }
            liveWaves = liveWaves.filter((wave) => !wave.shipIds.every(isRaiderGone));

            const latestWaveCleared = latestWaveShipIds.every(isRaiderGone);
            if (latestWaveCleared) {
                waveClearTimer = (waveClearTimer ?? 0) + deltaSeconds;
            }
            secondsSinceLatestSpawn += deltaSeconds;

            const clearDelayHit = waveClearTimer !== null && waveClearTimer >= WAVE_CLEAR_DELAY_SECONDS;
            const intervalHit = secondsSinceLatestSpawn >= WAVE_INTERVAL_SECONDS;
            if (clearDelayHit || intervalHit) {
                spawnWave();
            }
        },
    };
}

export const wave_defence: GameMap = createWaveDefenceMap();
