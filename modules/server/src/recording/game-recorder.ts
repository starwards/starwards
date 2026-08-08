import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as readline from 'node:readline';

import { RecordingHeader, encodeFrameLine, encodeHeader, parseFrameLine, parseHeader } from './recording-format';

import { GameManager } from '../admin/game-manager';
import { createLogger } from '@starwards/core/internal';
import { createReadStream } from 'node:fs';
import { schemaToString } from '../serialization/game-state-serialization';

const { error: logError } = createLogger('server:game-recorder');

export interface RecordingSummary {
    name: string;
    mapName: string;
    startedAt: string;
    durationSeconds: number;
    frameCount: number;
}

export const RECORDING_EXT = '.swr.jsonl';

/** True for a plain recording file name — no directory part, correct extension. */
export function isRecordingName(name: string): boolean {
    return (
        name.endsWith(RECORDING_EXT) &&
        name.length > RECORDING_EXT.length &&
        !/[/\\]/.test(name) &&
        path.basename(name) === name
    );
}

/**
 * A precondition on the game itself, not a failure of the recording machinery — the caller
 * can retry once the game state allows it. Everything else (disk full, unwritable directory)
 * is a server-side failure and must not be reported as a conflict.
 */
export class RecordingConflictError extends Error {}

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
    /** `GameManager.totalSeconds` when this recording started; frame `t` is relative to it. */
    private baseSeconds = 0;

    constructor(
        private manager: GameManager,
        private dir: string,
        private intervalMs = 1000,
    ) {}

    public async startRecording(): Promise<string> {
        if (!this.manager.state.isGameRunning) {
            throw new RecordingConflictError("can't start recording: no game is running");
        }
        if (this.manager.state.isRecordingGame) {
            throw new RecordingConflictError('a recording is already in progress');
        }
        const savedGame = this.manager.saveGame();
        if (!savedGame) {
            throw new RecordingConflictError("can't start recording: no game is running");
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
        this.lastWrittenT = null;
        this.baseSeconds = this.manager.totalSeconds;
        this.manager.state.isRecordingGame = true;
        try {
            await fs.writeFile(this.filePath, encodeHeader(header), 'utf-8');
            await this.writeFrame();
        } catch (e) {
            this.finalize();
            throw e;
        }
        if (!this.filePath) {
            // the game stopped while frame 0 was being written; writeFrame already finalized
            throw new RecordingConflictError("can't start recording: the game stopped before the first frame");
        }
        this.timer = setInterval(() => this.tick(), this.intervalMs);
        this.timer.unref();
        return filename;
    }

    public async stopRecording(): Promise<void> {
        this.clearTimer();
        await this.inFlight;
        this.finalize();
    }

    private clearTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /**
     * Closes the current recording. Safe to call from inside a frame write (unlike
     * `stopRecording()`, which awaits the in-flight write and would self-deadlock there).
     * Clearing `filePath` also makes any later stray write a no-op, so nothing can append
     * to a finalized file.
     */
    private finalize() {
        this.clearTimer();
        this.filePath = null;
        this.lastWrittenT = null;
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
            if (!isRecordingName(name)) continue;
            const summary = await summarizeRecording(path.join(this.dir, name), name);
            if (summary) summaries.push(summary);
        }
        // newest first: the recording a GM wants to replay is nearly always the last one made
        summaries.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
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
        const filePath = this.filePath;
        if (!filePath) return;
        const savedGame = this.manager.saveGame();
        if (!savedGame) {
            this.finalize();
            return;
        }
        const t = this.manager.totalSeconds - this.baseSeconds;
        if (this.lastWrittenT !== null && t === this.lastWrittenT) {
            return;
        }
        const frame = await schemaToString(savedGame);
        if (this.filePath !== filePath) return; // finalized (or restarted) while serializing
        await fs.appendFile(filePath, encodeFrameLine({ t, frame }), 'utf-8');
        this.lastWrittenT = t;
    }
}

/**
 * Reads a recording's header and scans to its last frame for the total length. Counts lines
 * rather than decoding them: every frame line carries a multi-KB encoded snapshot, and only
 * the tail's timestamp is needed.
 */
export async function summarizeRecording(filePath: string, name: string): Promise<RecordingSummary | null> {
    const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    let header: RecordingHeader | null = null;
    let frameCount = 0;
    let lastLine: string | null = null;
    let prevLine: string | null = null;
    try {
        for await (const line of rl) {
            if (!line) continue;
            if (!header) {
                header = parseHeader(line);
                continue;
            }
            prevLine = lastLine;
            lastLine = line;
            frameCount++;
        }
    } catch (e) {
        logError(`can't read recording ${filePath}:`, e);
        return null;
    } finally {
        rl.close();
        fileStream.close();
    }
    if (!header) return null;
    let lastFrame = lastLine === null ? null : parseFrameLine(lastLine);
    if (!lastFrame && lastLine !== null) {
        frameCount--; // truncated tail line of an in-progress recording, not a frame
        lastFrame = prevLine === null ? null : parseFrameLine(prevLine);
    }
    return {
        name,
        mapName: header.mapName,
        startedAt: header.startedAt,
        durationSeconds: lastFrame?.t ?? 0,
        frameCount,
    };
}
