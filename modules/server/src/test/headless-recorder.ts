import * as fs from 'node:fs';
import * as path from 'node:path';

import { Explosion, Spaceship, XY } from '@starwards/core/internal';

import { encodeFrameLine, encodeHeader } from '../recording/recording-format';

import { HeadlessGame } from './headless-game';
import { RECORDING_EXT } from '../recording/game-recorder';
import { schemaToString } from '../serialization/game-state-serialization';

/** A state edge observed at tick resolution, written to the `.events.jsonl` sidecar. */
export type RecordedEvent =
    | {
          /** Game seconds of the tick the edge was observed after. */
          readonly t: number;
          readonly kind: 'fire_start' | 'fire_stop';
          readonly objectId: string;
          /** Chain gun index on the ship. */
          readonly mount: number;
      }
    | {
          readonly t: number;
          /** First tick an explosion physically overlaps a ship; once per explosion per ship. */
          readonly kind: 'blast_hit';
          readonly objectId: string;
          readonly explosionId: string;
          readonly damageType: string;
      };

export const EVENTS_EXT = '.events.jsonl';

/**
 * Writes a {@link HeadlessGame} run in the server's recording format (`.swr.jsonl`), one frame
 * every `intervalSimSeconds` of game time -- not wall time, since a headless run is far faster
 * than realtime. The file replays in the GM replay UI and every frame is a `SavedGame` a run can
 * be branched from via `HeadlessGame.restore`.
 *
 * Frames are sampled, so a burst shorter than the interval leaves no trace in them. Chain gun
 * `isFiring` edges and first blast-on-ship overlaps are therefore observed every tick and written
 * as {@link RecordedEvent} lines to a sidecar `<name>.events.jsonl`, leaving the recording format
 * itself untouched.
 */
export class HeadlessRecorder {
    readonly filePath: string;
    readonly eventsPath: string;
    private nextFrameAt = 0;
    private frames = 0;
    private readonly firing = new Map<string, boolean>();
    private readonly blastHits = new Set<string>();
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
        this.observeBlastHits();
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

    private observeBlastHits() {
        const state = this.game.spaceManager.state;
        const ships = [...state].filter((o): o is Spaceship => Spaceship.isInstance(o) && !o.destroyed);
        for (const explosion of state) {
            if (!Explosion.isInstance(explosion) || explosion.destroyed) {
                continue;
            }
            for (const ship of ships) {
                const key = `${explosion.id}/${ship.id}`;
                if (
                    !this.blastHits.has(key) &&
                    XY.distance(explosion.position, ship.position) < explosion.radius + ship.radius
                ) {
                    this.blastHits.add(key);
                    this.pendingEvents.push({
                        t: this.game.seconds,
                        kind: 'blast_hit',
                        objectId: ship.id,
                        explosionId: explosion.id,
                        damageType: explosion.damageType,
                    });
                }
            }
        }
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
