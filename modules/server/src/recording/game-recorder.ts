import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as readline from 'node:readline';

import { RecordingHeader, encodeFrameLine, encodeHeader, parseFrameLine, parseHeader } from './recording-format';

import { GameManager } from '../admin/game-manager';
import { createLogger } from '@starwards/core/internal';
import { createReadStream } from 'node:fs';
import { schemaToString } from '../serialization/game-state-serialization';

const { error: logError } = createLogger('server:game-recorder');

interface RecordingSummary {
    name: string;
    mapName: string;
    startedAt: string;
    durationSeconds: number;
    frameCount: number;
}

const RECORDING_EXT = '.swr.jsonl';

/**
 * Records a running game to a JSONL file on a wall-clock interval, for later replay
 * (see `ReplayPlayer`). Owned by the server layer, like `startSnapshotPersistence` — not by
 * `GameManager` — so a stopped game (via any path) is simply the next tick's `saveGame()`
 * returning `null`, which self-finalizes the recording without `GameManager` knowing a
 * recorder exists.
 */
export class GameRecorder {
    private timer: ReturnType<typeof setInterval> | null = null;
    private inFlight: Promise<unknown> | null = null;
    private filePath: string | null = null;
    private lastWrittenT: number | null = null;
    private frameCount = 0;

    constructor(
        private manager: GameManager,
        private dir: string,
        private intervalMs = 1000,
    ) {}

    public async startRecording(): Promise<string> {
        if (!this.manager.state.isGameRunning) {
            throw new Error("can't start recording: no game is running");
        }
        if (this.manager.state.isRecordingGame) {
            throw new Error('a recording is already in progress');
        }
        const savedGame = this.manager.saveGame();
        if (!savedGame) {
            throw new Error("can't start recording: no game is running");
        }
        const startedAt = new Date().toISOString();
        const filename = `${savedGame.mapName}_${Date.now()}${RECORDING_EXT}`;
        await fs.mkdir(this.dir, { recursive: true });
        this.filePath = path.join(this.dir, filename);
        const header: RecordingHeader = {
            format: 'starwards-recording',
            version: 1,
            mapName: savedGame.mapName,
            startedAt,
            intervalMs: this.intervalMs,
        };
        await fs.writeFile(this.filePath, encodeHeader(header), 'utf-8');
        this.frameCount = 0;
        this.lastWrittenT = null;
        await this.writeFrame();
        this.manager.state.isRecordingGame = true;
        this.timer = setInterval(() => this.tick(), this.intervalMs);
        this.timer.unref();
        return filename;
    }

    public async stopRecording(): Promise<void> {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        await this.inFlight;
        this.manager.state.isRecordingGame = false;
    }

    public async listRecordings(): Promise<RecordingSummary[]> {
        let entries: string[];
        try {
            entries = await fs.readdir(this.dir);
        } catch {
            return [];
        }
        const summaries: RecordingSummary[] = [];
        for (const name of entries) {
            if (!name.endsWith(RECORDING_EXT)) continue;
            const summary = await summarizeRecording(path.join(this.dir, name), name);
            if (summary) summaries.push(summary);
        }
        return summaries;
    }

    private tick() {
        if (this.inFlight) return;
        this.inFlight = this.writeFrame()
            .catch((e: unknown) => logError(`error writing recording frame:`, e))
            .finally(() => {
                this.inFlight = null;
            });
    }

    private async writeFrame(): Promise<void> {
        const savedGame = this.manager.saveGame();
        if (!savedGame) {
            await this.stopRecording();
            return;
        }
        const t = this.manager.totalSeconds;
        if (this.lastWrittenT !== null && t === this.lastWrittenT) {
            return;
        }
        const frame = await schemaToString(savedGame);
        await fs.appendFile(this.filePath!, encodeFrameLine({ t, frame }), 'utf-8');
        this.lastWrittenT = t;
        this.frameCount++;
    }
}

async function summarizeRecording(filePath: string, name: string): Promise<RecordingSummary | null> {
    const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    let header: RecordingHeader | null = null;
    let frameCount = 0;
    let lastT = 0;
    try {
        for await (const line of rl) {
            if (!line) continue;
            if (!header) {
                header = parseHeader(line);
                continue;
            }
            const frame = parseFrameLine(line);
            if (frame) {
                frameCount++;
                lastT = frame.t;
            }
        }
    } catch (e) {
        logError(`can't read recording ${filePath}:`, e);
        return null;
    } finally {
        rl.close();
        fileStream.close();
    }
    if (!header) return null;
    return {
        name,
        mapName: header.mapName,
        startedAt: header.startedAt,
        durationSeconds: lastT,
        frameCount,
    };
}
