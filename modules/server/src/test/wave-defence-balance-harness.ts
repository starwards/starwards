import {
    AmmoType,
    IdleStrategy,
    Projectile,
    ShipState,
    SmartPilotMode,
    Spaceship,
    XY,
    capToRange,
    isTargetInKillZone,
    moveToTarget,
    rotateToTarget,
} from '@starwards/core/internal';
import {
    DEFAULT_WAVE_TUNING,
    STATIONS,
    WaveDefenceTuning,
    WriteOffReason,
    createWaveDefenceMap,
    waveBudget,
} from '../scenarios/wave-defence';
import { HeadlessGame, SERVER_TICK_HZ } from './headless-game';

import { BlastOverlaps } from './blast-overlaps';
import { inGunRange } from './training/gunnery-metrics';
import { median } from './training/analysis/metrics';
import { tapDamage } from './damage-tap';

const PLAYER_SHIP_ID = 'GVTS';
/** A raider this close to the GVTS is engaged; further off, the proxy holds its guard station instead of chasing. */
const PROXY_ENGAGE_RADIUS_METERS = 12_000;
const PROXY_DECISION_SECONDS = 1;
/** `standoff-missiles` proxy: distance it holds beyond the raider nearest the guarded station. */
const STANDOFF_METERS = 10_000;
/** `standoff-missiles` proxy: tubes fire at raiders within this distance of the GVTS. */
const MISSILE_ENGAGE_METERS = 15_000;
/** `standoff-missiles` proxy salvo discipline: launch only while fewer than this many GVTS missiles are in flight. */
const MAX_MISSILES_IN_FLIGHT = 2;
/** `standoff-missiles` pilot: thrusters coast once the GVTS is this close to its post... */
const POST_HOLD_METERS = 1_000;
/** ...and fly again once it is this far off. */
const POST_RESUME_METERS = 2_000;
/** `standoff-missiles` pilot: at this fraction of max speed it stops thrusting along its velocity (cruise). */
const CRUISE_SPEED_FRACTION = 0.98;
/** A wave's arrival phase opens when its first raider comes this close to the station it targets. */
const ARRIVAL_RADIUS_METERS = 40_000;

/** Deterministic PRNG (mulberry32), so a seed replays the same waves. */
function seededRng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

interface WaveRecord {
    readonly wave: number;
    readonly budget: number;
    readonly hulls: number;
    readonly spawnedAt: number;
    /** The station the wave was ordered to attack. */
    readonly targetStationId: string;
    /** First sim-second any of its raiders was within {@link ARRIVAL_RADIUS_METERS} of `targetStationId`. */
    arrivedAt?: number;
    /** Next wave's spawn, or run end. */
    endedAt: number;
    /** Each station's `healthRatio` when this wave ended; 0 once destroyed. */
    stationHealth: Record<string, number>;
    /** Per station, summed `Damage.amount` of GVTS-fired damage events it received during this wave (friendly fire). */
    readonly gvtsDamageOnStations: Record<string, number>;
    /** GVTS missiles launched while this wave was the latest. */
    missilesLaunched: number;
}

interface RaiderRecord {
    readonly model: string;
    readonly wave: number;
    readonly spawnedAt: number;
    goneAt?: number;
    /** `killed`: its capsule was breached (combat death); otherwise the scenario's write-off rule that removed it. */
    fate?: 'killed' | WriteOffReason;
    /** Its wave's arrival phase (arrival until the next wave spawns), while it lived. */
    readonly arrival: ArrivalGunnery;
    /** Aggro: seconds alive, and of those, seconds on its standing order (no held attacker). */
    readonly attention: Attention;
    /** The raider's ship state, kept past its manager's removal so its capsule can be read once it is gone. */
    state?: ShipState;
    /** Held attacker last tick, for flip/return edges. */
    lastHeldId?: string | null;
}

/** Aggro: how a raider's attention moved between its standing order and the GVTS. */
interface Attention {
    aliveSeconds: number;
    /** Seconds on its standing order (no held attacker). */
    missionSeconds: number;
    switches: number;
    /** Times it turned on the GVTS, and times it went back to its order from the GVTS. */
    flips: number;
    returns: number;
    firstFlipAt?: number;
    /** Seconds alive since its first flip, and of those, seconds with the GVTS held. */
    afterFirstFlipSeconds: number;
    onGvtsSeconds: number;
    /** GVTS blasts that landed on it while it held the GVTS, and GVTS distance integrated over those seconds. */
    onGvtsHits: number;
    onGvtsDistanceSeconds: number;
}

/** One raider's exposure to fire from its wave's arrival until it is gone. */
interface ArrivalGunnery {
    seconds: number;
    /** Seconds within the GVTS chain gun's `maxShellRange`. */
    inRangeSeconds: number;
    /** Distinct GVTS blasts that overlapped it. */
    gvtsHits: number;
    /** GVTS weapon damage events it took: one per shell blast or missile, blast or impact. */
    gvtsDamageEvents: number;
    /** Distinct blasts from any shooter that overlapped it after its last armor plate broke. */
    postStripHits: number;
    /** Capsule integrity lost. */
    capsuleLost: number;
}

/** Who the GVTS proxy guards and when it engages. */
export type PlayerProxy =
    /** Guard the station nearest the raider closest to any station; engage within {@link PROXY_ENGAGE_RADIUS_METERS}. */
    | 'nearest-station'
    /**
     * Guard the latest wave's target station from the raiders' side of it, on the station-to-nearest-raider
     * bearing at half the GVTS chain gun's `maxShellRange`; engage within that range. Raiders of older waves
     * that target another station are ignored.
     */
    | 'targeted-station'
    /**
     * The GVTS as a crewed player ship (no orders): it flies to a post {@link STANDOFF_METERS} beyond the
     * raider nearest the latest wave's target station, on the station-to-raider bearing, so the station is
     * never between them, with its weapons target and hull locked on the raider nearest it. Guns fire in the
     * kill zone unless BLOCKED; tubes fire at that target within {@link MISSILE_ENGAGE_METERS}. Same raider
     * filter as `targeted-station`.
     */
    | 'standoff-missiles';

export interface RunResult {
    readonly seed: number;
    readonly waveReached: number;
    readonly defeated: boolean;
    readonly simSeconds: number;
    readonly waves: WaveRecord[];
    readonly raiders: RaiderRecord[];
    /** GVTS `healthRatio` at run end (1 = intact). */
    readonly playerHealth: number;
}

interface RunOptions {
    readonly seed: number;
    readonly tuning?: WaveDefenceTuning;
    readonly maxSimSeconds: number;
    readonly hz?: number;
    readonly proxy?: PlayerProxy;
    /** `standoff-missiles` tube ammo, in order: the next type loads when the current one runs out. */
    readonly missileAmmo?: readonly AmmoType[];
    /** Called after every tick, for diagnostics that need tick resolution. */
    readonly onTick?: (game: HeadlessGame) => void;
}

/**
 * Crude stand-in for a crew: the GVTS on NPC automation guards the station the raiders are closest
 * to, and engages a raider once one comes within {@link PROXY_ENGAGE_RADIUS_METERS} of the GVTS
 * itself. It does not chase: a dragonfly's 600 m/s beats the GVTS's 450, so pursuit only ever
 * trails the wave (measured: chasing kept every raider ~100 km away and cut blast hits on raiders
 * from 170/min, T0, to under 2/min). Untested against a human baseline -- numbers tune the game
 * against this bot, not against crews.
 */
function drivePlayerProxy(game: HeadlessGame, raiderIds: Iterable<string>) {
    const player = game.api.getObject(PLAYER_SHIP_ID);
    const playerShip = game.api.getShip(PLAYER_SHIP_ID);
    if (!player || !playerShip) {
        return;
    }
    const stations = STATIONS.filter((s) => game.api.getShip(s.id));
    if (!stations.length) {
        return;
    }
    let closest: { id: string; toPlayer: number; toStation: number; station: XY } | undefined;
    for (const id of raiderIds) {
        const raider = game.api.getObject(id);
        if (!raider || raider.destroyed) {
            continue;
        }
        const station = stations.reduce((best, s) =>
            XY.distance(s.position, raider.position) < XY.distance(best.position, raider.position) ? s : best,
        );
        const toStation = XY.distance(station.position, raider.position);
        const toPlayer = XY.distance(player.position, raider.position);
        if (!closest || toStation < closest.toStation) {
            closest = { id, toPlayer, toStation, station: station.position };
        }
    }
    if (!closest) {
        return;
    }
    if (closest.toPlayer <= PROXY_ENGAGE_RADIUS_METERS) {
        if (playerShip.state.orderTargetId !== closest.id) {
            game.api.orderAttack(PLAYER_SHIP_ID, closest.id);
        }
    } else {
        // Guard the threatened station rather than trail the wave.
        game.api.orderMove(PLAYER_SHIP_ID, closest.station);
    }
}

/** See {@link PlayerProxy} `targeted-station`. `raiderIds` are the raiders threatening `targetStationId`. */
function driveTargetedStationProxy(game: HeadlessGame, raiderIds: Iterable<string>, targetStationId: string) {
    const player = game.api.getObject(PLAYER_SHIP_ID);
    const playerShip = game.api.getShip(PLAYER_SHIP_ID);
    const guarded =
        STATIONS.find((s) => s.id === targetStationId && game.api.getShip(s.id)) ??
        STATIONS.find((s) => game.api.getShip(s.id));
    if (!player || !playerShip || !guarded) {
        return;
    }
    const engageRadius = playerShip.state.chainGuns[0].design.maxShellRange;
    let nearestToPlayer: { id: string; distance: number } | undefined;
    let nearestToStation: { position: XY; distance: number } | undefined;
    for (const id of raiderIds) {
        const raider = game.api.getObject(id);
        if (!raider || raider.destroyed) {
            continue;
        }
        const toPlayer = XY.distance(player.position, raider.position);
        if (!nearestToPlayer || toPlayer < nearestToPlayer.distance) {
            nearestToPlayer = { id, distance: toPlayer };
        }
        const toStation = XY.distance(guarded.position, raider.position);
        if (!nearestToStation || toStation < nearestToStation.distance) {
            nearestToStation = { position: raider.position, distance: toStation };
        }
    }
    if (nearestToPlayer && nearestToPlayer.distance <= engageRadius) {
        if (playerShip.state.orderTargetId !== nearestToPlayer.id) {
            game.api.orderAttack(PLAYER_SHIP_ID, nearestToPlayer.id);
        }
        return;
    }
    const post = nearestToStation
        ? XY.add(
              guarded.position,
              XY.byLengthAndDirection(
                  engageRadius / 2,
                  XY.angleOf(XY.difference(nearestToStation.position, guarded.position)),
              ),
          )
        : guarded.position;
    game.api.orderMove(PLAYER_SHIP_ID, post);
}

/** See {@link PlayerProxy} `standoff-missiles`: the movement half, re-planned each decision. */
function standoffPost(game: HeadlessGame, raiderIds: readonly string[], targetStationId: string): XY | null {
    const guarded =
        STATIONS.find((s) => s.id === targetStationId && game.api.getShip(s.id)) ??
        STATIONS.find((s) => game.api.getShip(s.id));
    if (!guarded) {
        return null;
    }
    let anchor: { position: XY; distance: number } | undefined;
    for (const id of raiderIds) {
        const raider = game.api.getObject(id);
        if (!raider || raider.destroyed) {
            continue;
        }
        const distance = XY.distance(guarded.position, raider.position);
        if (!anchor || distance < anchor.distance) {
            anchor = { position: raider.position, distance };
        }
    }
    return anchor
        ? XY.add(
              anchor.position,
              XY.byLengthAndDirection(STANDOFF_METERS, XY.angleOf(XY.difference(anchor.position, guarded.position))),
          )
        : guarded.position;
}

/**
 * See {@link PlayerProxy} `standoff-missiles`: the GVTS crew, every tick, on a player ship's smart
 * pilot -- no orders. Pilot: weapons target on the raider nearest the GVTS, rotation locked on it
 * (TARGET), and the flight to the standoff post flown by hand (DIRECT), coasting within
 * {@link POST_HOLD_METERS} of it until it is {@link POST_RESUME_METERS} off, and cruising at max speed
 * rather than thrusting into the speed cap (which the ship brakes back down from). Weapons: each chain gun
 * fires while its shot is in the kill zone and its line of fire isn't BLOCKED.
 */
function driveCrew(
    game: HeadlessGame,
    raiderIds: readonly string[],
    post: XY | null,
    pilot: { holding: boolean },
    deltaSeconds: number,
) {
    const crewed = game.shipManagers.get(PLAYER_SHIP_ID);
    const player = game.api.getObject(PLAYER_SHIP_ID);
    if (!crewed || !player) {
        return;
    }
    const { state } = crewed;
    let engaged: { id: string; distance: number } | undefined;
    for (const id of raiderIds) {
        const raider = game.api.getObject(id);
        if (!raider || raider.destroyed) {
            continue;
        }
        const distance = XY.distance(player.position, raider.position);
        if (!engaged || distance < engaged.distance) {
            engaged = { id, distance };
        }
    }
    if (state.weaponsTarget.targetId !== (engaged?.id ?? null)) {
        crewed.setTarget(engaged?.id ?? null);
    }
    const target = crewed.weaponsTarget;
    crewed.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
    crewed.setSmartPilotRotationMode(target ? SmartPilotMode.TARGET : SmartPilotMode.DIRECT);
    // TARGET reads `rotation` as an aim-offset nudge; none. DIRECT without a target faces the post.
    state.smartPilot.rotation = !target && post ? rotateToTarget(deltaSeconds, state, post, 0) : 0;
    const offPost = post ? XY.distance(player.position, post) : 0;
    pilot.holding = offPost < POST_HOLD_METERS || (pilot.holding && offPost < POST_RESUME_METERS);
    const maneuvering = post && !pilot.holding ? moveToTarget(deltaSeconds, state, post) : { boost: 0, strafe: 0 };
    let command = state.localToGlobal({
        x: capToRange(-1, 1, maneuvering.boost),
        y: capToRange(-1, 1, maneuvering.strafe),
    });
    if (XY.lengthOf(player.velocity) >= state.maxSpeed * CRUISE_SPEED_FRACTION) {
        const heading = XY.normalize(player.velocity);
        const along = XY.dot(command, heading);
        if (along > 0) {
            command = XY.difference(command, XY.scale(heading, along));
        }
    }
    const local = state.globalToLocal(command);
    state.smartPilot.maneuvering.x = local.x;
    state.smartPilot.maneuvering.y = local.y;
    for (const gun of state.chainGuns) {
        gun.isFiring = !!target && isTargetInKillZone(state, gun, target) && !gun.lineOfFireBlocked;
    }
}

/** See {@link PlayerProxy} `standoff-missiles`: the tubes, every tick, at the crew's weapons target. */
function driveTubes(game: HeadlessGame, missilesInFlight: number, ammo: readonly AmmoType[]) {
    const player = game.api.getObject(PLAYER_SHIP_ID);
    const playerShip = game.api.getShip(PLAYER_SHIP_ID);
    if (!player || !playerShip) {
        return;
    }
    const { magazine, tubes } = playerShip.state;
    for (const tube of tubes) {
        if (tube.projectile === 'None' || magazine.getCount(tube.projectile) === 0) {
            tube.projectile = ammo.find((type) => magazine.getCount(type) > 0) ?? 'None';
        }
    }
    if (missilesInFlight >= MAX_MISSILES_IN_FLIGHT) {
        return;
    }
    const target = playerShip.state.weaponsTarget.targetId
        ? game.api.getObject(playerShip.state.weaponsTarget.targetId)
        : undefined;
    if (!target || XY.distance(player.position, target.position) > MISSILE_ENGAGE_METERS) {
        return;
    }
    for (const tube of tubes) {
        tube.safetyLocked = false;
    }
    playerShip.state.fireTubesCommand = true;
}

function stationHealth(game: HeadlessGame): Record<string, number> {
    return Object.fromEntries(STATIONS.map((s) => [s.id, game.api.getShip(s.id)?.state.healthRatio ?? 0]));
}

export function runWaveDefence({
    seed,
    tuning = DEFAULT_WAVE_TUNING,
    maxSimSeconds,
    hz = SERVER_TICK_HZ,
    proxy = 'nearest-station',
    missileAmmo = ['HiExpMissile', 'ArmPenMissile'],
    onTick,
}: RunOptions): RunResult {
    const waves: WaveRecord[] = [];
    const raiders = new Map<string, RaiderRecord>();
    let game: HeadlessGame | undefined;
    const now = () => game?.seconds ?? 0;
    const writeOffs = new Map<string, WriteOffReason>();
    const map = createWaveDefenceMap(seededRng(seed), tuning, {
        onWaveSpawned: (wave, shipIds, targetStationId) => {
            const previous = waves[waves.length - 1];
            if (previous && game) {
                previous.endedAt = now();
                previous.stationHealth = stationHealth(game);
            }
            waves.push({
                wave,
                budget: waveBudget(wave, tuning.budgetExponent),
                hulls: shipIds.length,
                spawnedAt: now(),
                targetStationId,
                endedAt: NaN,
                stationHealth: {},
                gvtsDamageOnStations: {},
                missilesLaunched: 0,
            });
            for (const id of shipIds) {
                raiders.set(id, {
                    model: '',
                    wave,
                    spawnedAt: now(),
                    state: game?.api.getShip(id)?.state,
                    attention: {
                        aliveSeconds: 0,
                        missionSeconds: 0,
                        switches: 0,
                        flips: 0,
                        returns: 0,
                        afterFirstFlipSeconds: 0,
                        onGvtsSeconds: 0,
                        onGvtsHits: 0,
                        onGvtsDistanceSeconds: 0,
                    },
                    arrival: {
                        seconds: 0,
                        inRangeSeconds: 0,
                        gvtsHits: 0,
                        gvtsDamageEvents: 0,
                        postStripHits: 0,
                        capsuleLost: 0,
                    },
                });
            }
        },
        onRaiderWrittenOff: (id, reason) => writeOffs.set(id, reason),
    });
    // The crew has no engineer to keep the reactor solvent (5 energy/s against >100/s at full thrust),
    // so it draws free energy like an NPC; see HeadlessGame.
    game = HeadlessGame.start(map, seed, {
        crewedPlayer: proxy === 'standoff-missiles',
        labFreeEnergy: proxy === 'standoff-missiles',
    });
    tapGvtsDamage(game, waves, raiders);
    const player = game.api.getShip(PLAYER_SHIP_ID);
    if (player) {
        player.state.idleStrategy = IdleStrategy.STAND_GROUND;
    }

    const dt = 1 / hz;
    let sinceDecision = PROXY_DECISION_SECONDS;
    const live = new Set<string>();
    const blastOverlaps = new BlastOverlaps();
    const missilesSeen = new Set<string>();
    let missilesInFlight = 0;
    let threatening: string[] = [];
    let post: XY | null = null;
    const pilot = { holding: false };
    while (game.seconds < maxSimSeconds && !game.stopped) {
        for (const [id, record] of raiders) {
            if (record.goneAt === undefined) {
                live.add(id);
            }
        }
        sinceDecision += dt;
        if (sinceDecision >= PROXY_DECISION_SECONDS) {
            sinceDecision = 0;
            const { targetStationId } = waves[waves.length - 1];
            threatening = [...live].filter(
                (id) => waves[(raiders.get(id)?.wave ?? 0) - 1]?.targetStationId === targetStationId,
            );
            if (proxy === 'targeted-station') {
                driveTargetedStationProxy(game, threatening, targetStationId);
            } else if (proxy === 'standoff-missiles') {
                post = standoffPost(game, threatening, targetStationId);
            } else {
                drivePlayerProxy(game, live);
            }
        }
        if (proxy === 'standoff-missiles') {
            driveCrew(game, threatening, post, pilot, dt);
            driveTubes(game, missilesInFlight, missileAmmo);
        }
        const capsuleBefore = new Map([...live].map((id) => [id, raiders.get(id)?.state?.capsule.integrity ?? 1]));
        game.tick(dt);
        onTick?.(game);
        missilesInFlight = 0;
        for (const object of game.spaceManager.state) {
            if (Projectile.isInstance(object) && object.design.homing && object.shipId === PLAYER_SHIP_ID) {
                missilesInFlight++;
                if (!missilesSeen.has(object.id)) {
                    missilesSeen.add(object.id);
                    waves[waves.length - 1].missilesLaunched++;
                }
            }
        }
        sampleArrival(game, waves, raiders, live, capsuleBefore, blastOverlaps, dt);
        for (const id of live) {
            const record = raiders.get(id);
            if (!record) {
                continue;
            }
            const object = game.api.getObject(id);
            if (object && !object.destroyed) {
                if (!record.model && Spaceship.isInstance(object)) {
                    (record as { model: string }).model = object.model ?? '';
                }
                record.state ??= game.api.getShip(id)?.state;
                if (record.state) {
                    trackAttention(record, record.state.threat.heldId, game, object.position, dt);
                }
                continue;
            }
            record.goneAt = game.seconds;
            record.fate = writeOffs.get(id) ?? (record.state?.capsule.broken ? 'killed' : undefined);
            if (!record.fate) {
                // the scenario removes raiders only by capsule breach or a write-off rule
                throw new Error(`raider ${id} left play with its capsule intact and no write-off`);
            }
            live.delete(id);
        }
    }
    const last = waves[waves.length - 1];
    if (last) {
        last.endedAt = game.seconds;
        last.stationHealth = stationHealth(game);
    }
    return {
        seed,
        waveReached: last?.wave ?? 0,
        defeated: game.stopped,
        simSeconds: game.seconds,
        waves,
        raiders: [...raiders.values()],
        playerHealth: game.api.getShip(PLAYER_SHIP_ID)?.state.healthRatio ?? 0,
    };
}

/** Folds one tick of `heldId` into the raider's {@link Attention}. */
function trackAttention(record: RaiderRecord, heldId: string | null, game: HeadlessGame, position: XY, dt: number) {
    const attention = record.attention;
    const previous = record.lastHeldId ?? null;
    if (heldId === PLAYER_SHIP_ID && previous !== PLAYER_SHIP_ID) {
        attention.flips++;
        attention.firstFlipAt ??= game.seconds;
    } else if (heldId === null && previous === PLAYER_SHIP_ID) {
        attention.returns++;
    }
    record.lastHeldId = heldId;
    attention.aliveSeconds += dt;
    if (heldId === null) {
        attention.missionSeconds += dt;
    }
    if (attention.firstFlipAt !== undefined) {
        attention.afterFirstFlipSeconds += dt;
    }
    if (heldId === PLAYER_SHIP_ID) {
        attention.onGvtsSeconds += dt;
        const gvts = game.api.getObject(PLAYER_SHIP_ID);
        attention.onGvtsDistanceSeconds += gvts ? XY.distance(gvts.position, position) * dt : 0;
    }
    attention.switches = record.state?.threat.switches ?? attention.switches;
}

/**
 * Observes GVTS-fired damage events by wrapping `SpaceManager.resolveObjectDamage`, which each ship's
 * damage manager drains once per tick: on stations into the latest {@link WaveRecord.gvtsDamageOnStations},
 * on any raider whose wave has arrived into {@link ArrivalGunnery.gvtsDamageEvents}.
 * Pass-through: the damage itself is untouched.
 */
function tapGvtsDamage(game: HeadlessGame, waves: readonly WaveRecord[], raiders: ReadonlyMap<string, RaiderRecord>) {
    tapDamage(game, (id, damage) => {
        const wave = waves[waves.length - 1];
        if (!wave || damage.shipId !== PLAYER_SHIP_ID) {
            return;
        }
        const raider = raiders.get(id);
        if (STATIONS.some((s) => s.id === id)) {
            wave.gvtsDamageOnStations[id] = (wave.gvtsDamageOnStations[id] ?? 0) + damage.amount;
        } else if (raider && waves[raider.wave - 1]?.arrivedAt !== undefined) {
            raider.arrival.gvtsDamageEvents++;
        }
    });
}

/**
 * Accumulates {@link ArrivalGunnery} for every live raider whose wave has arrived (its first raider
 * within {@link ARRIVAL_RADIUS_METERS} of the wave's target station), until the raider is gone --
 * older waves' raiders included.
 */
function sampleArrival(
    game: HeadlessGame,
    waves: readonly WaveRecord[],
    raiders: ReadonlyMap<string, RaiderRecord>,
    live: ReadonlySet<string>,
    capsuleBefore: ReadonlyMap<string, number>,
    blastOverlaps: BlastOverlaps,
    dt: number,
) {
    const gvts = game.api.getShip(PLAYER_SHIP_ID);
    if (!gvts) {
        return;
    }
    const tracked = [...live].flatMap((id) => {
        const record = raiders.get(id);
        const object = game.spaceManager.state.get(id);
        // A raider destroyed this tick still counts: the blast that breached its capsule landed on it.
        return record && object ? [{ id, record, object }] : [];
    });
    for (const wave of waves) {
        const station = STATIONS.find((s) => s.id === wave.targetStationId);
        if (
            wave.arrivedAt === undefined &&
            station &&
            tracked.some(
                ({ record, object }) =>
                    record.wave === wave.wave &&
                    !object.destroyed &&
                    XY.distance(object.position, station.position) <= ARRIVAL_RADIUS_METERS,
            )
        ) {
            wave.arrivedAt = game.seconds;
        }
    }
    const arrived = tracked.filter(({ record }) => waves[record.wave - 1]?.arrivedAt !== undefined);
    const byId = new Map(arrived.map((raider) => [raider.id, raider]));
    for (const { id, record, object } of arrived) {
        const arrival = record.arrival;
        if (!object.destroyed) {
            arrival.seconds += dt;
            if (inGunRange(gvts.state, object)) {
                arrival.inRangeSeconds += dt;
            }
        }
        if (record.state) {
            arrival.capsuleLost += Math.max(0, (capsuleBefore.get(id) ?? 1) - record.state.capsule.integrity);
        }
    }
    for (const [blast, target] of blastOverlaps.next(
        game.spaceManager.state,
        arrived.map(({ object }) => object),
    )) {
        const raider = byId.get(target.id);
        if (!raider) {
            continue;
        }
        if (blast.shipId === PLAYER_SHIP_ID) {
            raider.record.arrival.gvtsHits++;
            if (raider.record.state?.threat.heldId === PLAYER_SHIP_ID) {
                raider.record.attention.onGvtsHits++;
            }
        }
        if (raider.record.state?.armor.numberOfHealthyPlates === 0) {
            raider.record.arrival.postStripHits++;
        }
    }
}

// ---- aggregation ----

export interface SweepCell {
    readonly label: string;
    readonly tuning: WaveDefenceTuning;
    readonly runs: RunResult[];
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN);
const fmt = (n: number, digits = 0) => (Number.isFinite(n) ? n.toFixed(digits) : '–');

function totalStationHealth(record: WaveRecord) {
    return Object.values(record.stationHealth).reduce((a, b) => a + b, 0) / STATIONS.length;
}

export function sweepToMarkdown(cells: SweepCell[], maxSimSeconds: number, hz: number): string {
    const lines: string[] = [];
    lines.push('# Wave-defence balance report');
    lines.push('');
    lines.push('Generated by `wave-defence-balance.spec.ts` (`UPDATE_WAVE_BALANCE_REPORT=1`). Do not edit by hand.');
    lines.push('');
    lines.push(`- Headless core loop (no Colyseus), ${hz} Hz, cap ${maxSimSeconds} sim-s per run.`);
    lines.push(
        '- **Player proxy is crude**: GVTS on NPC automation, attacks nearest raider within 40 km of a station, else stands ground. No engineer, no repair, no human baseline -- numbers tune against this bot, not crews.',
    );
    lines.push(
        "- `killed` = the raider's capsule was breached; otherwise the write-off rule that removed it (can't fight / out of play).",
    );
    lines.push('');
    lines.push('## Survival');
    lines.push('');
    lines.push(
        '| config | runs | defeated | wave reached (min/med/max) | sim-s to defeat (med) | GVTS health end (mean) |',
    );
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const cell of cells) {
        const reached = cell.runs.map((r) => r.waveReached);
        const defeats = cell.runs.filter((r) => r.defeated);
        lines.push(
            `| ${cell.label} | ${cell.runs.length} | ${defeats.length} | ${Math.min(...reached)} / ${fmt(median(reached), 1)} / ${Math.max(...reached)} | ${fmt(median(defeats.map((r) => r.simSeconds)))} | ${fmt(mean(cell.runs.map((r) => r.playerHealth)), 2)} |`,
        );
    }
    lines.push('');
    lines.push('## Per wave (mean over runs that reached it)');
    for (const cell of cells) {
        lines.push('');
        lines.push(`### ${cell.label}`);
        lines.push('');
        lines.push(
            "| wave | budget | hulls | runs | sim-s in wave | station HP at end (avg of 3) | killed | can't fight | out of play | alive at end |",
        );
        lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
        const maxWave = Math.max(...cell.runs.map((r) => r.waveReached));
        for (let wave = 1; wave <= maxWave; wave++) {
            const records = cell.runs.flatMap((r) => r.waves.filter((w) => w.wave === wave));
            const wr = cell.runs.flatMap((r) => r.raiders.filter((x) => x.wave === wave));
            lines.push(
                `| ${wave} | ${records[0]?.budget ?? '–'} | ${fmt(mean(records.map((w) => w.hulls)), 1)} | ${records.length} | ${fmt(mean(records.map((w) => w.endedAt - w.spawnedAt)))} | ${fmt(mean(records.map(totalStationHealth)), 2)} | ${wr.filter((x) => x.fate === 'killed').length} | ${wr.filter((x) => x.fate === 'cant-fight').length} | ${wr.filter((x) => x.fate === 'out-of-play').length} | ${wr.filter((x) => !x.fate).length} |`,
            );
        }
    }
    lines.push('');
    lines.push('## Raider time-to-kill by hull (all configs pooled, killed only, sim-s from spawn)');
    lines.push('');
    lines.push("| hull | killed | can't fight | out of play | never gone | TTK median | TTK p90 |");
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    const all = cells.flatMap((c) => c.runs.flatMap((r) => r.raiders));
    for (const model of [...new Set(all.map((r) => r.model))].sort()) {
        const of = all.filter((r) => r.model === model);
        const ttk = of.filter((r) => r.fate === 'killed').map((r) => (r.goneAt ?? 0) - r.spawnedAt);
        const sorted = [...ttk].sort((a, b) => a - b);
        lines.push(
            `| ${model || '(never observed)'} | ${ttk.length} | ${of.filter((r) => r.fate === 'cant-fight').length} | ${of.filter((r) => r.fate === 'out-of-play').length} | ${of.filter((r) => !r.fate).length} | ${fmt(median(ttk))} | ${fmt(sorted[Math.floor(sorted.length * 0.9)] ?? NaN)} |`,
        );
    }
    lines.push('');
    return lines.join('\n');
}
