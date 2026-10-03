import * as fs from 'node:fs';
import * as path from 'node:path';

import {
    EVENTS_EXT,
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
 * (`energy`, data `{ demand, granted }`). Other modules add their own kinds through {@link HeadlessRecorder.record}.
 */
export class HeadlessRecorder {
    readonly filePath: string;
    readonly eventsPath: string;
    private nextFrameAt = 0;
    private frames = 0;
    private readonly firing = new Map<string, boolean>();
    private readonly blastHits = new BlastOverlaps();
    private readonly defectListeners = new WeakSet<ShipManager>();
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
            }
        }
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
