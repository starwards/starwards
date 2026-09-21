import * as fs from 'node:fs';
import * as path from 'node:path';

import { encodeFrameLine, encodeHeader } from '../recording/recording-format';

import { HeadlessGame } from './headless-game';
import { RECORDING_EXT } from '../recording/game-recorder';
import { schemaToString } from '../serialization/game-state-serialization';

/**
 * Writes a {@link HeadlessGame} run in the server's recording format (`.swr.jsonl`), one frame
 * every `intervalSimSeconds` of game time -- not wall time, since a headless run is far faster
 * than realtime. The file replays in the GM replay UI and every frame is a `SavedGame` a run can
 * be branched from via `HeadlessGame.restore`.
 */
export class HeadlessRecorder {
    readonly filePath: string;
    private nextFrameAt = 0;
    private frames = 0;

    constructor(
        private readonly game: HeadlessGame,
        dir: string,
        name: string,
        private readonly intervalSimSeconds: number,
        params?: unknown,
    ) {
        fs.mkdirSync(dir, { recursive: true });
        this.filePath = path.join(dir, `${name}${RECORDING_EXT}`);
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
            }),
        );
    }

    get frameCount() {
        return this.frames;
    }

    /** Writes a frame when due; call after every tick. `force` writes regardless (e.g. the final frame). */
    async capture(force = false) {
        if (!force && this.game.seconds + 1e-9 < this.nextFrameAt) {
            return;
        }
        const frame = await schemaToString(this.game.saveGame());
        fs.appendFileSync(this.filePath, encodeFrameLine({ t: this.game.seconds, frame }));
        this.frames++;
        this.nextFrameAt = this.game.seconds + this.intervalSimSeconds;
    }
}
