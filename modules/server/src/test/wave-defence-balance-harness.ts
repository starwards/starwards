import { AmmoType, Explosion, IdleStrategy, Projectile, ShipState, Spaceship, XY } from '@starwards/core/internal';
import {
    DEFAULT_WAVE_TUNING,
    STATIONS,
    WaveDefenceTuning,
    WriteOffReason,
    createWaveDefenceMap,
    waveBudget,
} from '../scenarios/wave-defence';
import { HeadlessGame, SERVER_TICK_HZ } from './headless-game';

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
    readonly attention: { aliveSeconds: number; missionSeconds: number; switches: number };
    /** The raider's ship state, kept past its manager's removal so its capsule can be read once it is gone. */
    state?: ShipState;
}

/** One raider's exposure to fire during its wave's arrival phase. */
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
     * Stand off {@link STANDOFF_METERS} beyond the raider nearest the latest wave's target station, on the
     * station-to-raider bearing, so the station is never between them. Guns engage opportunistically; tubes
     * fire at the raider nearest the GVTS within {@link MISSILE_ENGAGE_METERS}. Same raider filter as
     * `targeted-station`.
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
function driveStandoffProxy(game: HeadlessGame, raiderIds: readonly string[], targetStationId: string) {
    const guarded =
        STATIONS.find((s) => s.id === targetStationId && game.api.getShip(s.id)) ??
        STATIONS.find((s) => game.api.getShip(s.id));
    if (!guarded) {
        return;
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
    const post = anchor
        ? XY.add(
              anchor.position,
              XY.byLengthAndDirection(STANDOFF_METERS, XY.angleOf(XY.difference(anchor.position, guarded.position))),
          )
        : guarded.position;
    game.api.orderMove(PLAYER_SHIP_ID, post);
}

/** See {@link PlayerProxy} `standoff-missiles`: the tube half, every tick. */
function driveTubes(
    game: HeadlessGame,
    raiderIds: readonly string[],
    missilesInFlight: number,
    ammo: readonly AmmoType[],
) {
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
    let nearest: { id: string; distance: number } | undefined;
    for (const id of raiderIds) {
        const raider = game.api.getObject(id);
        if (!raider || raider.destroyed) {
            continue;
        }
        const distance = XY.distance(player.position, raider.position);
        if (distance <= MISSILE_ENGAGE_METERS && (!nearest || distance < nearest.distance)) {
            nearest = { id, distance };
        }
    }
    if (!nearest) {
        return;
    }
    playerShip.setTarget(nearest.id);
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
                    attention: { aliveSeconds: 0, missionSeconds: 0, switches: 0 },
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
    game = HeadlessGame.start(map, seed);
    tapGvtsDamage(game, () => waves[waves.length - 1], raiders);
    const player = game.api.getShip(PLAYER_SHIP_ID);
    if (player) {
        player.state.idleStrategy = IdleStrategy.STAND_GROUND;
    }

    const dt = 1 / hz;
    const gvtsRange = player?.state.chainGuns[0].design.maxShellRange ?? 0;
    let sinceDecision = PROXY_DECISION_SECONDS;
    const live = new Set<string>();
    /** Blasts already counted against each raider, so one blast counts once however long it overlaps. */
    const seenBlasts = new Map<string, Set<string>>();
    const missilesSeen = new Set<string>();
    let missilesInFlight = 0;
    let threatening: string[] = [];
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
                driveStandoffProxy(game, threatening, targetStationId);
            } else {
                drivePlayerProxy(game, live);
            }
        }
        if (proxy === 'standoff-missiles') {
            driveTubes(game, threatening, missilesInFlight, missileAmmo);
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
        sampleArrival(game, waves[waves.length - 1], raiders, live, capsuleBefore, seenBlasts, gvtsRange, dt);
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
                    record.attention.aliveSeconds += dt;
                    if (record.state.threat.heldId === null) {
                        record.attention.missionSeconds += dt;
                    }
                    record.attention.switches = record.state.threat.switches;
                }
                continue;
            }
            record.goneAt = game.seconds;
            record.fate = writeOffs.get(id) ?? 'killed';
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

/**
 * Observes GVTS-fired damage events by wrapping `SpaceManager.resolveObjectDamage`, which each ship's
 * damage manager drains once per tick: on stations into {@link WaveRecord.gvtsDamageOnStations}, on the
 * latest wave's raiders during its arrival phase into {@link ArrivalGunnery.gvtsDamageEvents}.
 * Pass-through: the damage itself is untouched.
 */
function tapGvtsDamage(
    game: HeadlessGame,
    currentWave: () => WaveRecord | undefined,
    raiders: ReadonlyMap<string, RaiderRecord>,
) {
    const { spaceManager } = game;
    const resolve = spaceManager.resolveObjectDamage.bind(spaceManager);
    spaceManager.resolveObjectDamage = function* (id: string) {
        const onStation = STATIONS.some((s) => s.id === id);
        for (const damage of resolve(id)) {
            const wave = currentWave();
            if (wave && damage.shipId === PLAYER_SHIP_ID) {
                const raider = raiders.get(id);
                if (onStation) {
                    wave.gvtsDamageOnStations[id] = (wave.gvtsDamageOnStations[id] ?? 0) + damage.amount;
                } else if (raider?.wave === wave.wave && wave.arrivedAt !== undefined) {
                    raider.arrival.gvtsDamageEvents++;
                }
            }
            yield damage;
        }
    };
}

/**
 * Accumulates {@link ArrivalGunnery} for the latest wave's live raiders once that wave has arrived.
 * A wave's phase ends when the next one spawns, so only the latest wave is ever sampled.
 */
function sampleArrival(
    game: HeadlessGame,
    wave: WaveRecord,
    raiders: ReadonlyMap<string, RaiderRecord>,
    live: ReadonlySet<string>,
    capsuleBefore: ReadonlyMap<string, number>,
    seenBlasts: Map<string, Set<string>>,
    gvtsRange: number,
    dt: number,
) {
    const gvts = game.api.getObject(PLAYER_SHIP_ID);
    const station = STATIONS.find((s) => s.id === wave.targetStationId);
    if (!gvts || !station) {
        return;
    }
    const waveRaiders = [...live].flatMap((id) => {
        const record = raiders.get(id);
        const object = game.spaceManager.state.get(id);
        // A raider destroyed this tick still counts: the blast that breached its capsule landed on it.
        return record?.wave === wave.wave && object ? [{ id, record, object }] : [];
    });
    if (wave.arrivedAt === undefined) {
        if (
            !waveRaiders.some(
                ({ object }) =>
                    !object.destroyed && XY.distance(object.position, station.position) <= ARRIVAL_RADIUS_METERS,
            )
        ) {
            return;
        }
        wave.arrivedAt = game.seconds;
    }
    const blasts = [...game.spaceManager.state].filter((o): o is Explosion => Explosion.isInstance(o) && !o.destroyed);
    for (const { id, record, object } of waveRaiders) {
        const arrival = record.arrival;
        if (!object.destroyed) {
            arrival.seconds += dt;
            if (XY.distance(object.position, gvts.position) <= gvtsRange) {
                arrival.inRangeSeconds += dt;
            }
        }
        const state = record.state;
        if (state) {
            arrival.capsuleLost += Math.max(0, (capsuleBefore.get(id) ?? 1) - state.capsule.integrity);
        }
        const stripped = state ? state.armor.numberOfHealthyPlates === 0 : false;
        let seen = seenBlasts.get(id);
        if (!seen) {
            seen = new Set();
            seenBlasts.set(id, seen);
        }
        for (const blast of blasts) {
            if (seen.has(blast.id) || XY.distance(blast.position, object.position) >= blast.radius + object.radius) {
                continue;
            }
            seen.add(blast.id);
            if (blast.shipId === PLAYER_SHIP_ID) {
                arrival.gvtsHits++;
            }
            if (stripped) {
                arrival.postStripHits++;
            }
        }
    }
}

// ---- aggregation ----

export interface SweepCell {
    readonly label: string;
    readonly tuning: WaveDefenceTuning;
    readonly runs: RunResult[];
}

function median(values: number[]): number {
    if (!values.length) {
        return NaN;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
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
