import * as fs from 'node:fs';
import * as path from 'node:path';

import { encodeFrameLine, encodeHeader } from '../recording/recording-format';

import { HeadlessGame } from './headless-game';
import { RECORDING_EXT } from '../recording/game-recorder';
import { schemaToString } from '../serialization/game-state-serialization';

/** A state edge observed at tick resolution, written to the `.events.jsonl` sidecar. */
export interface RecordedEvent {
    /** Game seconds of the tick the edge was observed after. */
    readonly t: number;
    readonly kind: 'fire_start' | 'fire_stop';
    readonly objectId: string;
    /** Chain gun index on the ship. */
    readonly mount: number;
}

export const EVENTS_EXT = '.events.jsonl';

/**
 * Writes a {@link HeadlessGame} run in the server's recording format (`.swr.jsonl`), one frame
 * every `intervalSimSeconds` of game time -- not wall time, since a headless run is far faster
 * than realtime. The file replays in the GM replay UI and every frame is a `SavedGame` a run can
 * be branched from via `HeadlessGame.restore`.
 *
 * Frames are sampled, so a burst shorter than the interval leaves no trace in them. Chain gun
 * `isFiring` edges are therefore observed every tick and written as {@link RecordedEvent} lines to
 * a sidecar `<name>.events.jsonl`, leaving the recording format itself untouched.
 */
export class HeadlessRecorder {
    readonly filePath: string;
    readonly eventsPath: string;
    private nextFrameAt = 0;
    private frames = 0;
    private readonly firing = new Map<string, boolean>();
    private pendingEvents: RecordedEvent[] = [];

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
     * Call after every tick: records `isFiring` edges for this tick, and writes a frame (flushing
     * pending events) when one is due. `force` writes a frame regardless (e.g. the final frame).
     */
    async capture(force = false) {
        this.observeFiring();
        if (!force && this.game.seconds + 1e-9 < this.nextFrameAt) {
            return;
        }
        if (this.pendingEvents.length) {
            fs.appendFileSync(this.eventsPath, this.pendingEvents.map((e) => JSON.stringify(e) + '\n').join(''));
            this.pendingEvents = [];
        }
        const frame = await schemaToString(this.game.saveGame());
        fs.appendFileSync(this.filePath, encodeFrameLine({ t: this.game.seconds, frame }));
        this.frames++;
        this.nextFrameAt = this.game.seconds + this.intervalSimSeconds;
    }

    private observeFiring() {
        for (const [objectId, manager] of this.game.shipManagers) {
            manager.state.chainGuns.forEach((gun, mount) => {
                const key = `${objectId}/${mount}`;
                if ((this.firing.get(key) ?? false) !== gun.isFiring) {
                    this.firing.set(key, gun.isFiring);
                    this.pendingEvents.push({
                        t: this.game.seconds,
                        kind: gun.isFiring ? 'fire_start' : 'fire_stop',
                        objectId,
                        mount,
                    });
                }
            });
        }
    }
}
