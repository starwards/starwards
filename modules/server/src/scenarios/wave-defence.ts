import {
    AggroCharacterName,
    Faction,
    FlightDoctrine,
    GameApi,
    GameMap,
    IdleStrategy,
    PowerLevel,
    ShipModel,
    Spaceship,
    Vec2,
    XY,
    aggroCharacters,
    ammoTypes,
    makeId,
    missionWeightForHits,
    mix,
    mulberry32,
    withMissionWeight,
    withSpawnNoise,
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

/** Hulls a wave may buy. */
export type RaiderHull = 'dragonfly-MK1' | 'dragonfly-MK2' | 'predator' | 'glaive' | 'cataphract';

/** Balance levers, overridable by the headless balance harness; production uses {@link DEFAULT_WAVE_TUNING}. */
export interface WaveDefenceTuning {
    readonly budgetExponent: number;
    readonly hullScores: Readonly<Record<RaiderHull, number>>;
    readonly waveIntervalSeconds: number;
}

export const DEFAULT_WAVE_TUNING: WaveDefenceTuning = {
    budgetExponent: 1.3,
    hullScores: { 'dragonfly-MK1': 5, 'dragonfly-MK2': 8, predator: 30, glaive: 35, cataphract: 50 },
    waveIntervalSeconds: WAVE_INTERVAL_SECONDS,
};

/** Wave `n`'s points budget: 10, 25, 42, 60, 81, 105, 126, 148, 174, 200 for waves 1-10. */
export function waveBudget(waveNumber: number, exponent = DEFAULT_WAVE_TUNING.budgetExponent): number {
    return Math.ceil(waveNumber ** exponent * 10);
}

/** Who a wave-defence raider is ordered to engage. */
export type WaveTargetPolicy =
    { readonly kind: 'station' } | { readonly kind: 'player' } | { readonly kind: 'follow-heavy' };

/** One raider's hull, flight doctrine, order and aggro character, as authored by a wave archetype (issue #2241). */
export interface WaveShipSpec {
    readonly model: ShipModel;
    readonly flightDoctrine: FlightDoctrine;
    readonly targetPolicy: WaveTargetPolicy;
    /** `null`: no aggro, the raider never leaves its order. */
    readonly aggro: AggroCharacterName | null;
}

const MK1_MODEL = 'dragonfly-MK1';
const MK2_MODEL = 'dragonfly-MK2';

/** Hull prices under one tuning. The predator is the anchor hull for Gunline and Escort. */
function hullTables({ hullScores }: WaveDefenceTuning) {
    const heavies = (['cataphract', 'glaive', 'predator'] as const)
        .map((model): readonly [ShipModel, number] => [model, hullScores[model]])
        .sort((a, b) => b[1] - a[1]);
    const swarm: (readonly [ShipModel, number])[] = [
        [MK1_MODEL, hullScores[MK1_MODEL]],
        [MK2_MODEL, hullScores[MK2_MODEL]],
    ];
    return { heavies, swarm, predator: hullScores.predator, mk1: hullScores[MK1_MODEL], mk2: hullScores[MK2_MODEL] };
}
type HullTables = ReturnType<typeof hullTables>;

/**
 * Fast, many, closes range: dragonfly-MK1/MK2 only, filled randomly until the budget runs out.
 */
function buildSwarm(budget: number, rng: () => number, hulls: HullTables): WaveShipSpec[] {
    let remaining = budget;
    const specs: WaveShipSpec[] = [];
    for (;;) {
        const affordable = hulls.swarm.filter(([, score]) => score <= remaining);
        if (!affordable.length) {
            return specs;
        }
        const [model, score] = affordable[Math.floor(rng() * affordable.length)];
        specs.push({
            model,
            flightDoctrine: FlightDoctrine.INTERCEPT,
            targetPolicy: { kind: 'station' },
            aggro: 'Brawler',
        });
        remaining -= score;
    }
}

/** Few, heavy, sits at range: largest affordable hulls first, remainder in MK1s. */
function buildGunline(budget: number, hulls: HullTables): WaveShipSpec[] {
    let remaining = budget;
    const specs: WaveShipSpec[] = [];
    for (const [model, score] of hulls.heavies) {
        while (remaining >= score) {
            specs.push({
                model,
                flightDoctrine: FlightDoctrine.STANDOFF,
                targetPolicy: { kind: 'station' },
                aggro: 'Brawler',
            });
            remaining -= score;
        }
    }
    while (remaining >= hulls.mk1) {
        specs.push({
            model: MK1_MODEL,
            flightDoctrine: FlightDoctrine.STANDOFF,
            targetPolicy: { kind: 'station' },
            aggro: 'Brawler',
        });
        remaining -= hulls.mk1;
    }
    return specs;
}

/** Splits the crew's attention: half the budget in MK2s shadowing the player, the rest MK1s on the station. */
function buildHarass(budget: number, hulls: HullTables): WaveShipSpec[] {
    const half = Math.floor(budget / 2);
    const specs: WaveShipSpec[] = [];
    let remaining = half;
    while (remaining >= hulls.mk2) {
        specs.push({
            model: MK2_MODEL,
            flightDoctrine: FlightDoctrine.SHADOW,
            targetPolicy: { kind: 'player' },
            aggro: 'Hunter',
        });
        remaining -= hulls.mk2;
    }
    let stationBudget = budget - half + remaining; // unspent half-budget rolls over
    while (stationBudget >= hulls.mk1) {
        specs.push({
            model: MK1_MODEL,
            flightDoctrine: FlightDoctrine.INTERCEPT,
            targetPolicy: { kind: 'station' },
            aggro: 'Brawler',
        });
        stationBudget -= hulls.mk1;
    }
    return specs;
}

/** One heavy holding station, MK1s shadowing it -- the escorts fall back to the station if the heavy dies. */
function buildEscort(budget: number, hulls: HullTables): WaveShipSpec[] {
    const specs: WaveShipSpec[] = [
        {
            model: 'predator',
            flightDoctrine: FlightDoctrine.STANDOFF,
            targetPolicy: { kind: 'station' },
            aggro: 'Brawler',
        },
    ];
    let remaining = budget - hulls.predator;
    while (remaining >= hulls.mk1) {
        specs.push({
            model: MK1_MODEL,
            flightDoctrine: FlightDoctrine.SHADOW,
            targetPolicy: { kind: 'follow-heavy' },
            aggro: 'Brawler',
        });
        remaining -= hulls.mk1;
    }
    return specs;
}

/**
 * Aggro `missionWeight` per hull class, in provoking hits (`missionWeightForHits`). With the 1.25
 * switch margin, a swarm hull turns on its shooter after about 4 GVTS HiExp blasts, a heavy after
 * about 16.
 */
const HITS_TO_PROVOKE = { swarm: 3, heavy: 12.5 } as const;

function hitsToProvoke(model: ShipModel): number {
    return model === MK1_MODEL || model === MK2_MODEL ? HITS_TO_PROVOKE.swarm : HITS_TO_PROVOKE.heavy;
}

const ARCHETYPE_CYCLE = ['gunline', 'harass', 'swarm', 'escort'] as const;
type ArchetypeName = (typeof ARCHETYPE_CYCLE)[number];

function anchorAffordable(name: ArchetypeName, budget: number, hulls: HullTables): boolean {
    switch (name) {
        case 'gunline':
            return budget >= hulls.predator;
        case 'harass':
            return Math.floor(budget / 2) >= hulls.mk2;
        case 'swarm':
            return budget >= hulls.mk1;
        case 'escort':
            return budget >= hulls.predator;
    }
}

/**
 * Waves 2+ cycle Gunline -> Harass -> Swarm -> Escort -> ..., skipping an archetype that can't
 * afford its anchor hull at that wave's budget and taking the next one instead. The skip is
 * itself deterministic from `waveBudget`, so replaying from wave 2 up to `waveNumber` always
 * lands on the same archetype (issue #2241, A4).
 */
function archetypeForWave(waveNumber: number, tuning: WaveDefenceTuning, hulls: HullTables): ArchetypeName {
    let cursor = 0;
    let picked: ArchetypeName = ARCHETYPE_CYCLE[0];
    for (let n = 2; n <= waveNumber; n++) {
        const budget = waveBudget(n, tuning.budgetExponent);
        for (let attempts = 0; attempts < ARCHETYPE_CYCLE.length; attempts++) {
            picked = ARCHETYPE_CYCLE[cursor % ARCHETYPE_CYCLE.length];
            cursor++;
            if (anchorAffordable(picked, budget, hulls)) {
                break;
            }
        }
    }
    return picked;
}

/**
 * Wave 1 is always Swarm and always exactly two dragonfly-MK1 (the tutorial wave, kept easy) --
 * wave 1's budget of 10 buys nothing else. Waves 2+ rotate through the authored archetypes.
 */
export function generateWaveSpecs(
    waveNumber: number,
    rng: () => number = Math.random,
    tuning: WaveDefenceTuning = DEFAULT_WAVE_TUNING,
): WaveShipSpec[] {
    if (waveNumber === 1) {
        const wave1Spec: WaveShipSpec = {
            model: MK1_MODEL,
            flightDoctrine: FlightDoctrine.INTERCEPT,
            targetPolicy: { kind: 'station' },
            aggro: 'Brawler',
        };
        return [wave1Spec, wave1Spec];
    }
    const hulls = hullTables(tuning);
    const budget = waveBudget(waveNumber, tuning.budgetExponent);
    switch (archetypeForWave(waveNumber, tuning, hulls)) {
        case 'gunline':
            return buildGunline(budget, hulls);
        case 'harass':
            return buildHarass(budget, hulls);
        case 'swarm':
            return buildSwarm(budget, rng, hulls);
        case 'escort':
            return buildEscort(budget, hulls);
    }
}

/** The hull list an authored wave archetype fills the wave with -- see {@link generateWaveSpecs}. */
export function generateWaveComposition(waveNumber: number, rng: () => number = Math.random): ShipModel[] {
    return generateWaveSpecs(waveNumber, rng).map((spec) => spec.model);
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

/** Why the scenario wrote a raider off (issue #2233). */
export type WriteOffReason = 'cant-fight' | 'out-of-play';

/** Observation hooks for headless harnesses; they never change play. */
interface WaveDefenceHooks {
    readonly onWaveSpawned?: (waveNumber: number, shipIds: readonly string[], targetStationId: string) => void;
    readonly onRaiderWrittenOff?: (shipId: string, reason: WriteOffReason) => void;
}

/**
 * Endless wave-defence scenario: three friendly stations the crew must defend against
 * procedurally generated raider waves. `rng` is injectable for deterministic tests; production
 * play uses `Math.random`.
 */
export function createWaveDefenceMap(
    rng: () => number = Math.random,
    tuning: WaveDefenceTuning = DEFAULT_WAVE_TUNING,
    { onWaveSpawned, onRaiderWrittenOff }: WaveDefenceHooks = {},
): GameMap {
    let game: GameApi;
    let waveNumber = 0;
    /** Per game, so each game's aggro noise differs; drawn once at init. */
    let noiseSeed = 0;
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
    /**
     * Ticks remaining before a just-spawned raider's archetype-authored order (attack the player,
     * follow the wave's heavy, ...) is guaranteed to have landed in ship automation. The
     * furthest-station fallback below must leave these alone in the meantime, or it clobbers a
     * Harass/Escort raider's order before it ever takes effect -- a fresh order and a
     * fallback-eligible cleared one are otherwise indistinguishable (both read order=NONE,
     * orderTargetId=null) (issue #2241).
     */
    const pendingInitialOrderTicks = new Map<string, number>();

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
        pendingInitialOrderTicks.delete(id);
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
                onRaiderWrittenOff?.(id, 'cant-fight');
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
                onRaiderWrittenOff?.(id, 'out-of-play');
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

        let heavyId: string | undefined;
        const shipIds = generateWaveSpecs(waveNumber, rng, tuning).map((spec, index) => {
            const id = makeId();
            const jitter = XY.byLengthAndDirection(rng() * SPAWN_JITTER_METERS, rng() * 360);
            const ship = new Spaceship().init(id, Vec2.make(XY.add(spawnCenter, jitter)), spec.model, Faction.Raiders);
            const shipApi = game.addNpcSpaceship(ship);
            shipApi.state.flightDoctrine = spec.flightDoctrine;
            if (spec.aggro) {
                // Own stream per ship, seeded from the game's noise seed, so the noise never shifts
                // the wave rng's later draws.
                shipApi.setAggroCharacter(
                    withSpawnNoise(
                        withMissionWeight(aggroCharacters[spec.aggro], missionWeightForHits(hitsToProvoke(spec.model))),
                        mulberry32(mix(mix(noiseSeed, waveNumber), index)),
                    ),
                );
            }
            if (spec.targetPolicy.kind === 'station') {
                game.orderAttack(id, targetId);
                heavyId = id;
            } else if (spec.targetPolicy.kind === 'player') {
                game.orderAttack(id, PLAYER_SHIP_ID);
            } else {
                game.orderFollow(id, heavyId ?? targetId);
            }
            // Landing takes two ticks: one to drain into SpaceManager's per-object order table,
            // one more for ship automation to read it (see the comment on `pendingInitialOrderTicks`).
            pendingInitialOrderTicks.set(id, 2);
            return id;
        });
        liveWaves.push({ shipIds });
        latestWaveShipIds = shipIds;
        waveClearTimer = null;
        secondsSinceLatestSpawn = 0;
        onWaveSpawned?.(waveNumber, shipIds, targetId);
    }

    return {
        name: 'wave_defence',
        init: (g) => {
            game = g;
            noiseSeed = Math.floor(rng() * 2 ** 32);
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
                    const pendingTicks = pendingInitialOrderTicks.get(shipId);
                    if (pendingTicks !== undefined) {
                        if (pendingTicks <= 1) {
                            pendingInitialOrderTicks.delete(shipId);
                        } else {
                            pendingInitialOrderTicks.set(shipId, pendingTicks - 1);
                        }
                        continue; // its spawnWave()-issued order hasn't had time to land yet
                    }
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
            const intervalHit = secondsSinceLatestSpawn >= tuning.waveIntervalSeconds;
            if (clearDelayHit || intervalHit) {
                spawnWave();
            }
        },
    };
}

export const wave_defence: GameMap = createWaveDefenceMap();
