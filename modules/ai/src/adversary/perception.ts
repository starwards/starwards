import { DEFAULT_WAVE_TUNING, createWaveDefenceMap } from '@starwards/server/src/scenarios/wave-defence';
import { Faction, ScanLevel, ShipModel, Spaceship, XY, mulberry32, shipConfigurations } from '@starwards/core/internal';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { median } from '@starwards/server/src/test/training/gunnery-metrics';

/**
 * Ruling Q4 (2026-10-24): NPCs perceive only what their faction's field of view and scan level give
 * them. Wave raiders spawn 140 km from the station they are ordered to attack, far outside any radar
 * a hull carries, and the wave map ships no crew to scan for them. This measures what faction-only
 * perception would hand a raider, on the real wave-defence map, played headless with the GVTS idle at
 * the origin and the stations on their own automation. Read-only: nothing here changes play.
 *
 * "Contact" is the target inside the raider's own field of view (what its radars sweep). "Lock" is the
 * raider's faction holding BASIC (identified) scan level on the target, which is what a scan job
 * promotes to from contact; "full" is FULL, which also needs a scan beam covering the target.
 */

const SAMPLE_SECONDS = 0.5;

interface Moment {
    /** Sim-seconds since the raider spawned. */
    readonly after: number;
    /** Distance to the target at that moment, metres. */
    readonly distance: number;
}

/** What one raider perceived of the target it was ordered to attack. */
interface RaiderPerception {
    readonly id: string;
    readonly model: ShipModel;
    readonly wave: number;
    readonly target: string;
    /** Distance to the ordered target at spawn. */
    readonly spawnDistance: number;
    /** Sim-seconds the raider lived within the run, spawn to death or the end. */
    readonly lifeSeconds: number;
    readonly died: boolean;
    /** First time the target was in the raider's own field of view. */
    readonly contact: Moment | null;
    /** First time the Raiders faction held BASIC or better on the target. */
    readonly lock: Moment | null;
    /** First time the Raiders faction held FULL on the target. */
    readonly full: Moment | null;
}

interface PerceptionRun {
    readonly seed: number;
    readonly seconds: number;
    readonly raiders: readonly RaiderPerception[];
}

interface Track {
    id: string;
    model: ShipModel;
    wave: number;
    spawnedAt: number;
    target: string;
    spawnDistance: number;
    contact: Moment | null;
    lock: Moment | null;
    full: Moment | null;
    endedAt: number | null;
}

/** Plays the wave-defence map for `seconds` and records, per raider, when its ordered target became perceivable. */
export function measureWavePerception(seed: number, seconds: number): PerceptionRun {
    const waveOf = new Map<string, number>();
    const map = createWaveDefenceMap(mulberry32(seed), DEFAULT_WAVE_TUNING, {
        onWaveSpawned: (wave, ids) => ids.forEach((id) => waveOf.set(id, wave)),
    });
    const game = HeadlessGame.start(map, seed, { crewedPlayer: true });
    const tracks = new Map<string, Track>();
    const dt = 1 / 60;
    let sinceSample = SAMPLE_SECONDS;
    while (game.seconds < seconds && !game.stopped) {
        game.tick(dt);
        sinceSample += dt;
        if (sinceSample < SAMPLE_SECONDS) {
            continue;
        }
        sinceSample = 0;
        for (const [id, wave] of waveOf) {
            observe(game, tracks, id, wave);
        }
    }
    return {
        seed,
        seconds: game.seconds,
        raiders: [...tracks.values()].map((t) => ({
            id: t.id,
            model: t.model,
            wave: t.wave,
            target: t.target,
            spawnDistance: t.spawnDistance,
            lifeSeconds: (t.endedAt ?? game.seconds) - t.spawnedAt,
            died: t.endedAt !== null,
            contact: t.contact,
            lock: t.lock,
            full: t.full,
        })),
    };
}

function observe(game: HeadlessGame, tracks: Map<string, Track>, id: string, wave: number) {
    const raider = game.spaceManager.state.get(id);
    const manager = game.shipManagers.get(id);
    if (!raider || !Spaceship.isInstance(raider) || !manager) {
        const gone = tracks.get(id);
        if (gone && gone.endedAt === null) {
            gone.endedAt = game.seconds;
        }
        return;
    }
    let track = tracks.get(id);
    if (!track) {
        const target = manager.state.orderTargetId;
        const targetObject = target ? game.spaceManager.state.get(target) : undefined;
        if (!target || !targetObject) {
            return; // the order has not landed yet
        }
        track = {
            id,
            model: raider.model as ShipModel,
            wave,
            spawnedAt: game.seconds,
            target,
            spawnDistance: XY.distance(raider.position, targetObject.position),
            contact: null,
            lock: null,
            full: null,
            endedAt: null,
        };
        tracks.set(id, track);
    }
    if (raider.destroyed) {
        track.endedAt ??= game.seconds;
        return;
    }
    const target = game.spaceManager.state.get(track.target);
    if (!target || target.destroyed) {
        return;
    }
    const moment = { after: game.seconds - track.spawnedAt, distance: XY.distance(raider.position, target.position) };
    if (!track.contact && game.spaceManager.isVisible(id, track.target)) {
        track.contact = moment;
    }
    const level = game.spaceManager.factionIntel.getScanLevel(track.target, Faction.Raiders);
    if (!track.lock && level >= ScanLevel.BASIC) {
        track.lock = moment;
    }
    if (!track.full && level >= ScanLevel.FULL) {
        track.full = moment;
    }
}

/** Radar reach of a hull as designed, metres at full effectiveness (the omni radar and the scan beam). */
export function hullRadarReach(model: ShipModel) {
    const radars = shipConfigurations[model].radars as readonly { isScanBeam?: boolean; range: number }[];
    const reach = (beam: boolean) => radars.filter((r) => !!r.isScanBeam === beam).map((r) => r.range);
    return { omni: Math.max(0, ...reach(false)), beam: Math.max(0, ...reach(true)) };
}

interface HullPerception {
    readonly model: ShipModel;
    readonly raiders: number;
    readonly medianSpawnDistance: number;
    readonly designOmniRange: number;
    readonly designBeamRange: number;
    /** Raiders that ever had contact / lock / full on their ordered target. */
    readonly contacts: number;
    readonly locks: number;
    readonly fulls: number;
    /** Median distance to the target at first contact and first lock; NaN with none. */
    readonly medianContactDistance: number;
    readonly medianLockDistance: number;
    /** Median seconds from spawn to first lock; NaN with none. */
    readonly medianLockAfter: number;
    /** Raiders that died or were still alive at the end of the run without ever holding a lock. */
    readonly neverLocked: number;
    /** Locks already held when the raider spawned: its faction earned them earlier. */
    readonly inheritedAtSpawn: number;
}

export function summariseHulls(runs: readonly PerceptionRun[], wave?: number): HullPerception[] {
    const raiders = runs.flatMap((r) => r.raiders).filter((r) => wave === undefined || r.wave === wave);
    const models = [...new Set(raiders.map((r) => r.model))];
    return models.map((model) => {
        const own = raiders.filter((r) => r.model === model);
        const withLock = own.filter((r) => r.lock);
        const reach = hullRadarReach(model);
        return {
            model,
            raiders: own.length,
            medianSpawnDistance: median(own.map((r) => r.spawnDistance)),
            designOmniRange: reach.omni,
            designBeamRange: reach.beam,
            contacts: own.filter((r) => r.contact).length,
            locks: withLock.length,
            fulls: own.filter((r) => r.full).length,
            medianContactDistance: median(own.flatMap((r) => (r.contact ? [r.contact.distance] : []))),
            medianLockDistance: median(withLock.map((r) => r.lock?.distance ?? NaN)),
            medianLockAfter: median(withLock.map((r) => r.lock?.after ?? NaN)),
            neverLocked: own.length - withLock.length,
            inheritedAtSpawn: withLock.filter((r) => (r.lock?.after ?? Infinity) < 1).length,
        };
    });
}

const km = (m: number) => (Number.isFinite(m) ? `${(m / 1000).toFixed(1)} km` : '-');
const sec = (s: number) => (Number.isFinite(s) ? `${s.toFixed(0)} s` : '-');

function hullTable(hulls: readonly HullPerception[]) {
    return [
        '| hull | raiders | design omni / beam range | spawn distance | contact | lock (BASIC) | of which inherited at spawn | full | median contact distance | median lock distance | median spawn-to-lock | never locked |',
        '|---|---|---|---|---|---|---|---|---|---|---|---|',
        ...hulls.map(
            (h) =>
                `| ${h.model} | ${h.raiders} | ${km(h.designOmniRange)} / ${km(h.designBeamRange)} | ${km(h.medianSpawnDistance)} | ${h.contacts} | ${h.locks} | ${h.inheritedAtSpawn} | ${h.fulls} | ${km(h.medianContactDistance)} | ${km(h.medianLockDistance)} | ${sec(h.medianLockAfter)} | ${h.neverLocked} |`,
        ),
        '',
    ];
}

export function perceptionMarkdown(runs: readonly PerceptionRun[]): string {
    const hulls = summariseHulls(runs);
    const total = hulls.reduce((n, h) => n + h.raiders, 0);
    const locked = hulls.reduce((n, h) => n + h.locks, 0);
    return [
        '# Wave-spawn perception under faction-only perception (ruling Q4)',
        '',
        `Wave-defence map, GVTS idle at the origin, stations on their own automation, seeds ${runs.map((r) => r.seed).join(', ')}, up to ${Math.max(...runs.map((r) => r.seconds)).toFixed(0)} sim-s each. ${total} raiders spawned 140 km from the station they are ordered to attack; ${locked} of them ever held a scan lock (BASIC or better, held by their faction) on that station before dying or the run ending. Scan levels are held per faction, so a raider can spawn already holding a lock an earlier raider earned.`,
        '',
        '## All waves',
        '',
        ...hullTable(hulls),
        '## Wave 1 only (nothing earned earlier)',
        '',
        ...hullTable(summariseHulls(runs, 1)),
    ].join('\n');
}
