import * as fs from 'node:fs';
import * as path from 'node:path';

import {
    EVENTS_EXT,
    Explosion,
    Projectile,
    RecordingEventLine,
    ShipManager,
    ShipManagerPc,
    Spaceship,
    encodeEventLine,
    encodeFrameLine,
    encodeHeader,
} from '@starwards/core/internal';
import { BlastOverlaps } from './blast-overlaps';
import { HeadlessGame } from './headless-game';
import { RECORDING_EXT } from '../recording/game-recorder';
import { schemaToString } from '../serialization/game-state-serialization';

/**
 * Writes a {@link HeadlessGame} run in the server's recording format (`.sgr`), one frame
 * every `intervalSimSeconds` of game time -- not wall time, since a headless run is far faster
 * than realtime. The file replays in the GM replay UI and every frame is a `SavedGame` a run can
 * be branched from via `HeadlessGame.restore`.
 *
 * Frames are sampled, so a burst shorter than the interval leaves no trace in them. Chain gun
 * `isFiring` edges (`fire_start`/`fire_stop`, data `{ mount }`) and first blast-on-ship overlaps
 * (`blast_hit`, data `{ explosionId, damageType }`) are therefore observed every tick and written as
 * {@link RecordingEventLine}s to a sidecar `<name>.events.jsonl`, leaving the `.sgr` untouched so
 * replay keeps working. So is every system defect (`defect`, data `{ system, cause }`, cause
 * `hit`/`overheat`/`warp`), and with each frame each player ship's previous-tick energy flow
 * (`energy`, data `{ demand, granted }`). Every projectile is written once as it appears (`shot`, objectId the
 * projectile, data `{ shipId, ammo, warhead, targetId, x, y, vx, vy, ttl }`; `targetId` is the shooter's weapons
 * target for an unguided round) and once as it goes (`projectile_end`, data `{ reason }`: `detonate` into a blast,
 * `impact` on a hull, `shotDown`, or `expire`), and every weapon hit a ship takes (`damage`, objectId the victim, data
 * `DamageReport`). Other modules add their own kinds through {@link HeadlessRecorder.record}.
 */
export class HeadlessRecorder {
    readonly filePath: string;
    readonly eventsPath: string;
    private nextFrameAt = 0;
    private frames = 0;
    private readonly firing = new Map<string, boolean>();
    private readonly blastHits = new BlastOverlaps();
    private readonly defectListeners = new WeakSet<ShipManager>();
    private readonly flying = new Map<string, { shipId: string; x: number; y: number; health: number }>();
    private readonly blasts = new Set<string>();
    private impactsThisTick = new Set<string>();
    private pendingEvents: RecordingEventLine[] = [];

    constructor(
        private readonly game: HeadlessGame,
        dir: string,
        name: string,
        private readonly intervalSimSeconds: number,
        params?: unknown,
        hz?: number,
    ) {
        fs.mkdirSync(dir, { recursive: true });
        this.filePath = path.join(dir, `${name}${RECORDING_EXT}`);
        this.eventsPath = path.join(dir, `${name}${EVENTS_EXT}`);
        fs.writeFileSync(this.eventsPath, '');
        fs.writeFileSync(
            this.filePath,
            encodeHeader({
                format: 'starwards-recording',
                version: 1,
                mapName: game.mapName,
                startedAt: new Date().toISOString(),
                intervalMs: intervalSimSeconds * 1000,
                seed: game.seed,
                params,
                hz,
            }),
        );
    }

    get frameCount() {
        return this.frames;
    }

    /**
     * Queues a sidecar event stamped with the current game time. It is written with the next frame,
     * so a sidecar never runs ahead of the `.sgr` it belongs to.
     */
    record(kind: string, objectId: string | undefined, data?: unknown) {
        this.pendingEvents.push({ t: this.game.seconds, kind, objectId, data });
    }

    /**
     * Call after every tick: records `isFiring` edges for this tick, and writes a frame (flushing
     * pending events) when one is due. `force` writes a frame regardless (e.g. the final frame).
     */
    async capture(force = false) {
        this.observeFiring();
        this.observeBlastHits();
        this.observeProjectiles();
        this.listenToDefects();
        if (!force && this.game.seconds + 1e-9 < this.nextFrameAt) {
            return;
        }
        this.recordEnergyFlow();
        if (this.pendingEvents.length) {
            fs.appendFileSync(this.eventsPath, this.pendingEvents.map((e) => encodeEventLine(e)).join(''));
            this.pendingEvents = [];
        }
        const frame = await schemaToString(this.game.saveGame());
        fs.appendFileSync(this.filePath, encodeFrameLine({ t: this.game.seconds, frame }));
        this.frames++;
        this.nextFrameAt = this.game.seconds + this.intervalSimSeconds;
    }

    private observeBlastHits() {
        const state = this.game.spaceManager.state;
        const ships = [...state].filter((o): o is Spaceship => Spaceship.isInstance(o) && !o.destroyed);
        for (const [explosion, ship] of this.blastHits.next(state, ships)) {
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

    private observeProjectiles() {
        const state = this.game.spaceManager.state;
        const newBlasts: Explosion[] = [];
        for (const e of state.getAll('Explosion')) {
            if (!this.blasts.has(e.id)) {
                this.blasts.add(e.id);
                newBlasts.push(e);
            }
        }
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
            const detonated = newBlasts.some(
                (e) => e.shipId === last.shipId && Math.hypot(e.position.x - last.x, e.position.y - last.y) < 200,
            );
            const reason = this.impactsThisTick.has(id)
                ? 'impact'
                : detonated
                  ? 'detonate'
                  : last.health <= 0
                    ? 'shotDown'
                    : 'expire';
            this.record('projectile_end', id, { reason });
        }
        this.impactsThisTick = new Set();
    }

    private recordShot(p: Projectile) {
        const shooter = this.game.shipManagers.get(p.shipId);
        this.record('shot', p.id, {
            shipId: p.shipId,
            ammo: p.model,
            warhead: p.warhead,
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
