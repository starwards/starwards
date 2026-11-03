import * as fs from 'node:fs';
import * as path from 'node:path';

import {
    AggroEventData,
    Explosion,
    Order,
    Projectile,
    RECORDING_EXT,
    RecordingEventLine,
    ShipManager,
    ShipManagerNpc,
    ShipManagerPc,
    currentEnergyModel,
    encodeEventLine,
    zstSidecarName,
} from '@starwards/core/internal';
import { BINARY_FILE_MAGIC, encodeRecordChunkSync } from '../recording/recording-file';
import { BlastOverlaps } from './blast-overlaps';
import { HeadlessGame } from './headless-game';
import { appendSidecar } from '../recording/sidecar-file';
import { schemaToBytes } from '../serialization/game-state-serialization';

/** Encoded event characters buffered before they are compressed into the sidecar as one zstd frame. */
const SIDECAR_CHUNK = 1 << 20;

/** Env knob for {@link HeadlessRecorderOptions.aggroLogPeriodS}: a heartbeat period in sim-seconds; unset or 0 is off. */
export const AGGRO_LOG_ENV = 'STARWARDS_AGGRO_LOG';
/** Threat-table entries per `aggro` line. */
const AGGRO_LOG_TOP = 3;

interface HeadlessRecorderOptions {
    /**
     * Writes `aggro` lines: one per NPC the tick its held target changes, and a heartbeat every this many
     * sim-seconds per NPC with a grudge or a held target; 0 heartbeats every tick. `undefined` (the default)
     * is off and reads {@link AGGRO_LOG_ENV}.
     */
    aggroLogPeriodS?: number;
}

/** The aggro log period from {@link AGGRO_LOG_ENV}; `undefined` (off) when unset, 0 or not a positive number. */
function aggroLogPeriodFromEnv(env: Record<string, string | undefined> = process.env): number | undefined {
    const period = Number(env[AGGRO_LOG_ENV]);
    return period > 0 ? period : undefined;
}

type AggroSeen = { switches: number; char: string; nextHeartbeatAt: number };

type Flying = { shipId: string; x: number; y: number; health: number };

/**
 * Writes a {@link HeadlessGame} run in the server's recording format (`.sgr`), one frame
 * every `intervalSimSeconds` of game time -- not wall time, since a headless run is far faster
 * than realtime. The file replays in the GM replay UI and every frame is a `SavedGame` a run can
 * be branched from via `HeadlessGame.restore`.
 *
 * Frames are sampled, so a burst shorter than the interval leaves no trace in them. Chain gun
 * `isFiring` edges (`fire_start`/`fire_stop`, data `{ mount }`) and first blast-on-ship overlaps
 * (`blast_hit`, data `{ explosionId, damageType }`) are therefore observed every tick and written as
 * {@link RecordingEventLine}s to a zstd-compressed sidecar `<name>.events.jsonl.zst`, leaving the `.sgr` untouched so
 * replay keeps working. So is every system defect (`defect`, data `{ system, cause }`, cause
 * `hit`/`overheat`/`warp`), and with each frame each player ship's previous-tick energy flow
 * (`energy`, data `{ demand, granted }`). Every projectile is written once as it appears (`shot`, objectId the
 * projectile, data `{ shipId, ammo, targetId, x, y, vx, vy, ttl }`; `targetId` is the shooter's weapons
 * target for an unguided round) and once as it goes (`projectile_end`, data `{ reason }`: `detonate` into a blast,
 * `impact` on a hull, `shotDown`, or `expire`), and every weapon hit a ship takes (`damage`, objectId the victim, data
 * `DamageReport`). With {@link HeadlessRecorderOptions.aggroLogPeriodS} set, every NPC's threat table
 * (`aggro`, objectId the NPC, data {@link AggroEventData}) on each held-target switch and on a heartbeat. Other modules add their own kinds through {@link HeadlessRecorder.record}.
 */
export class HeadlessRecorder {
    readonly filePath: string;
    readonly eventsPath: string;
    private nextFrameAt = 0;
    private frames = 0;
    private readonly firing = new Map<string, boolean>();
    private readonly blastHits = new BlastOverlaps();
    private readonly defectListeners = new WeakSet<ShipManager>();
    private readonly flying = new Map<string, Flying>();
    private gone: { id: string; last: Flying; t: number; waited: boolean }[] = [];
    private readonly blasts = new Set<string>();
    private impactsThisTick = new Set<string>();
    private pendingEvents: RecordingEventLine[] = [];
    private readonly aggroLogPeriodS: number | undefined;
    private readonly aggroSeen = new Map<string, AggroSeen>();
    /** Encoded events not yet compressed into the sidecar: one zstd frame per chunk compresses far better than one per frame. */
    private unwritten = '';

    constructor(
        private readonly game: HeadlessGame,
        dir: string,
        name: string,
        private readonly intervalSimSeconds: number,
        params?: unknown,
        hz?: number,
        { aggroLogPeriodS = aggroLogPeriodFromEnv() }: HeadlessRecorderOptions = {},
    ) {
        this.aggroLogPeriodS = aggroLogPeriodS;
        fs.mkdirSync(dir, { recursive: true });
        this.filePath = path.join(dir, `${name}${RECORDING_EXT}`);
        this.eventsPath = zstSidecarName(this.filePath);
        fs.writeFileSync(this.eventsPath, '');
        fs.writeFileSync(
            this.filePath,
            Buffer.concat([
                BINARY_FILE_MAGIC,
                encodeRecordChunkSync({
                    kind: 'header',
                    header: {
                        format: 'starwards-recording',
                        version: 2,
                        mapName: game.mapName,
                        startedAt: new Date().toISOString(),
                        intervalMs: intervalSimSeconds * 1000,
                        seed: game.seed,
                        params,
                        hz,
                        energyModel: currentEnergyModel(),
                    },
                }),
            ]),
        );
    }

    get frameCount() {
        return this.frames;
    }

    /**
     * Queues a sidecar event stamped with game time `t` (default: now). It is written with the next frame,
     * so a sidecar never runs ahead of the `.sgr` it belongs to.
     */
    record(kind: string, objectId: string | undefined, data?: unknown, t = this.game.seconds) {
        this.pendingEvents.push({ t, kind, objectId, data });
    }

    /**
     * Call after every tick: records `isFiring` edges for this tick, and writes a frame (flushing
     * pending events) when one is due. `force` writes a frame regardless (e.g. the final frame) and writes every
     * buffered event to the sidecar; otherwise events reach it in chunks of {@link SIDECAR_CHUNK} characters.
     */
    capture(force = false) {
        this.observeFiring();
        this.observeBlastHits();
        this.observeProjectiles();
        this.listenToDefects();
        this.observeAggro();
        if (!force && this.game.seconds + 1e-9 < this.nextFrameAt) {
            return;
        }
        this.recordEnergyFlow();
        this.unwritten += this.pendingEvents.map((e) => encodeEventLine(e)).join('');
        this.pendingEvents = [];
        if (this.unwritten && (force || this.unwritten.length >= SIDECAR_CHUNK)) {
            appendSidecar(this.eventsPath, this.unwritten);
            this.unwritten = '';
        }
        const bytes = schemaToBytes(this.game.saveGame());
        fs.appendFileSync(this.filePath, encodeRecordChunkSync({ kind: 'frame', t: this.game.seconds, bytes }));
        this.frames++;
        this.nextFrameAt = this.game.seconds + this.intervalSimSeconds;
    }

    private observeAggro() {
        const period = this.aggroLogPeriodS;
        if (period === undefined) return;
        const now = this.game.seconds;
        for (const [objectId, manager] of this.game.shipManagers) {
            if (!(manager instanceof ShipManagerNpc) || manager.spaceObject.destroyed) continue;
            const character = manager.aggroCharacter;
            if (!character) continue;
            const snapshot = manager.aggroSnapshot(AGGRO_LOG_TOP);
            const seen = this.aggroSeen.get(objectId);
            const switched = seen !== undefined && snapshot.switches !== seen.switches;
            const engaged = snapshot.heldId !== null || snapshot.top.length > 0;
            const due = engaged && (seen === undefined || now + 1e-9 >= seen.nextHeartbeatAt);
            if (!switched && !due) {
                if (seen) seen.switches = snapshot.switches;
                continue;
            }
            const char = {
                missionWeight: finiteOrNull(character.missionWeight),
                memorySeconds: character.memorySeconds,
                switchMargin: character.switchMargin,
                presenceRate: character.presenceRate,
            };
            const charKey = JSON.stringify(char);
            const last = manager.aggroLastSwitch;
            const data: AggroEventData = {
                type: { model: manager.spaceObject.model ?? '', character: manager.state.aiProfile.aggro },
                held: snapshot.heldId ?? '',
                order: { kind: Order[manager.state.order], targetId: manager.state.orderTargetId },
                top: snapshot.top,
                mission: finiteOrNull(snapshot.missionWeight),
                switches: snapshot.switches,
                ...(seen?.char === charKey ? {} : { char }),
                ...(switched && last
                    ? {
                          why: {
                              from: last.from ?? '',
                              to: last.to ?? '',
                              challengerScore: last.challengerScore,
                              heldScore: last.heldScore,
                          },
                      }
                    : {}),
            };
            this.record('aggro', objectId, data);
            this.aggroSeen.set(objectId, {
                switches: snapshot.switches,
                char: charKey,
                nextHeartbeatAt: due || !seen ? now + period : seen.nextHeartbeatAt,
            });
        }
    }

    private observeBlastHits() {
        const state = this.game.spaceManager.state;
        const ships = [...state.getAll('Spaceship')];
        for (const [explosion, ship] of this.blastHits.next(state.getAll('Explosion'), ships)) {
            this.record('blast_hit', ship.id, { explosionId: explosion.id, damageType: explosion.damageType });
        }
    }

    private listenToDefects() {
        for (const [objectId, manager] of this.game.shipManagers) {
            if (!this.defectListeners.has(manager)) {
                this.defectListeners.add(manager);
                manager.listenToDefects((system, cause) =>
                    this.record('defect', objectId, { system: system.name, cause }),
                );
                manager.listenToDamage((report) => {
                    this.impactsThisTick.add(report.sourceId);
                    this.record('damage', objectId, report);
                });
            }
        }
    }

    /**
     * A detonating round's blast enters space a tick after the round leaves it, so a round that is gone
     * is classified once the next tick's new blasts are known.
     */
    private observeProjectiles() {
        const state = this.game.spaceManager.state;
        const newBlasts: Explosion[] = [];
        for (const e of state.getAll('Explosion')) {
            if (!this.blasts.has(e.id)) {
                this.blasts.add(e.id);
                newBlasts.push(e);
            }
        }
        const near = (last: Flying) =>
            newBlasts.some(
                (e) => e.shipId === last.shipId && Math.hypot(e.position.x - last.x, e.position.y - last.y) < 200,
            );
        const stillPending: typeof this.gone = [];
        for (const g of this.gone) {
            if (near(g.last)) this.record('projectile_end', g.id, { reason: 'detonate' }, g.t);
            else if (g.waited)
                this.record('projectile_end', g.id, { reason: g.last.health <= 0 ? 'shotDown' : 'expire' }, g.t);
            else stillPending.push({ ...g, waited: true });
        }
        this.gone = stillPending;
        const live = new Set<string>();
        for (const p of state.getAll('Projectile')) {
            if (p.destroyed) continue;
            live.add(p.id);
            if (!this.flying.has(p.id)) this.recordShot(p);
            this.flying.set(p.id, { shipId: p.shipId, x: p.position.x, y: p.position.y, health: p.health });
        }
        for (const [id, last] of this.flying) {
            if (live.has(id)) continue;
            this.flying.delete(id);
            if (this.impactsThisTick.has(id)) this.record('projectile_end', id, { reason: 'impact' });
            else if (near(last)) this.record('projectile_end', id, { reason: 'detonate' });
            else this.gone.push({ id, last, t: this.game.seconds, waited: false });
        }
        this.impactsThisTick = new Set();
    }

    private recordShot(p: Projectile) {
        const shooter = this.game.shipManagers.get(p.shipId);
        this.record('shot', p.id, {
            shipId: p.shipId,
            ammo: p.model,
            targetId: p.targetId ?? shooter?.state.weaponsTarget.targetId ?? null,
            x: p.position.x,
            y: p.position.y,
            vx: p.velocity.x,
            vy: p.velocity.y,
            ttl: p.secondsToLive,
        });
    }

    private recordEnergyFlow() {
        for (const [objectId, manager] of this.game.shipManagers) {
            if (manager instanceof ShipManagerPc) {
                this.record('energy', objectId, { ...manager.energyFlow });
            }
        }
    }

    private observeFiring() {
        for (const [objectId, manager] of this.game.shipManagers) {
            manager.state.chainGuns.forEach((gun, mount) => {
                const key = `${objectId}/${mount}`;
                if ((this.firing.get(key) ?? false) !== gun.isFiring) {
                    this.firing.set(key, gun.isFiring);
                    this.record(gun.isFiring ? 'fire_start' : 'fire_stop', objectId, { mount });
                }
            });
        }
    }
}

function finiteOrNull(value: number | null) {
    return value !== null && Number.isFinite(value) ? value : null;
}
