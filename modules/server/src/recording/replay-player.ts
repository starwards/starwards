import * as path from 'node:path';
import * as readline from 'node:readline';

import { GameMap, GameStatus, createLogger } from '@starwards/core/internal';
import { RecordingHeader, parseFrameLine, parseHeader } from './recording-format';

import { GameManager } from '../admin/game-manager';
import { SavedGame } from '../serialization/game-state-protocol';
import { createReadStream } from 'node:fs';
import { stringToSchema } from '../serialization/game-state-serialization';
import { summarizeRecording } from './game-recorder';

const { error: logError } = createLogger('server:replay-player');

interface DecodedFrame {
    t: number;
    savedGame: SavedGame;
}

/**
 * Streams a `.swr.jsonl` recording one line at a time (never holding the whole file in
 * memory) and decodes frames one ahead of what's being applied, so decoding a long session
 * doesn't stall the tick that needs the next frame.
 */
class FrameReader {
    private readonly rl: readline.Interface;
    private readonly iterator: AsyncIterator<string, void>;
    private pending: Promise<DecodedFrame | null> | null = null;

    constructor(filePath: string) {
        this.rl = readline.createInterface({
            input: createReadStream(filePath, { encoding: 'utf-8' }),
            crlfDelay: Infinity,
        });
        this.iterator = this.rl[Symbol.asyncIterator]();
    }

    async readHeader(): Promise<RecordingHeader> {
        const { value, done } = await this.iterator.next();
        if (done || value === undefined) {
            throw new Error('recording file is empty');
        }
        return parseHeader(value);
    }

    /** Decodes (but does not consume) the next frame, caching the in-flight decode. */
    peekNext(): Promise<DecodedFrame | null> {
        this.pending ??= this.decodeNext();
        return this.pending;
    }

    async consumeNext(): Promise<DecodedFrame | null> {
        const frame = await this.peekNext();
        this.pending = null;
        return frame;
    }

    close() {
        this.rl.close();
    }

    private async decodeNext(): Promise<DecodedFrame | null> {
        const { value, done } = await this.iterator.next();
        if (done || value === undefined) {
            return null;
        }
        const parsed = parseFrameLine(value);
        if (!parsed) {
            return null; // truncated last line of an in-progress recording
        }
        const savedGame = await stringToSchema(SavedGame, parsed.frame);
        return { t: parsed.t, savedGame };
    }
}

/**
 * Replays a recorded `.swr.jsonl` file: loads frame 0 through the normal `loadGame` path
 * (rooms come up once), then applies every later frame in place via
 * `GameManager.applyReplayFrame` as `GameManager`'s own game clock reaches each frame's
 * timestamp — reusing `AdminState.speed` for pause/rate control instead of inventing a
 * separate one.
 */
export class ReplayPlayer {
    private reader: FrameReader | null = null;
    private currentFrame: DecodedFrame | null = null;
    private ended = false;
    /** `GameManager.totalSeconds` that frame time 0 maps to. Set when a replay starts. */
    private clockOffset = 0;
    /** `AdminState.speed` from before the replay took it over; `null` while no replay is loaded. */
    private speedBeforeReplay: number | null = null;
    private advancing: Promise<void> | null = null;
    private queuedTarget: number | null = null;

    constructor(
        private manager: GameManager,
        private mapsMap: Map<string, GameMap>,
    ) {}

    public async startReplay(filePath: string): Promise<void> {
        if (this.manager.state.gameStatus !== GameStatus.STOPPED) {
            throw new Error("can't start replay: a game is already running");
        }
        const reader = new FrameReader(filePath);
        let header: RecordingHeader;
        try {
            header = await reader.readHeader();
        } catch (e) {
            reader.close();
            throw e;
        }
        const map = this.mapsMap.get(header.mapName);
        if (!map) {
            reader.close();
            throw new Error(`can't find map named "${header.mapName}"`);
        }
        const frame0 = await reader.consumeNext();
        if (!frame0) {
            reader.close();
            throw new Error('recording has no frames');
        }
        // scanned up front so every station can show how far into the recording it is watching
        const summary = await summarizeRecording(filePath, path.basename(filePath));
        await this.manager.loadGame(frame0.savedGame, map);
        this.reader = reader;
        this.currentFrame = frame0;
        this.ended = false;
        this.advancing = null;
        this.queuedTarget = null;
        // Frame timestamps are relative to the start of the recording, while GameManager's
        // clock keeps running for the lifetime of the process. Anchor one to the other here,
        // or every recorded timestamp is already "in the past" and the whole recording is
        // consumed on the first tick.
        this.clockOffset = this.manager.totalSeconds - frame0.t;
        this.speedBeforeReplay = this.manager.state.speed;
        this.manager.state.replayDuration = summary?.durationSeconds ?? 0;
        this.manager.state.replayPosition = frame0.t;
        this.manager.state.gameStatus = GameStatus.REPLAY;
        this.manager.replayTick = (totalSeconds) => {
            this.advanceTo(totalSeconds).catch((e: unknown) => logError('error advancing replay:', e));
        };
    }

    /**
     * Applies the latest frame at or before `totalSeconds` (a `GameManager.totalSeconds`
     * reading), skipping intermediates. Runs are serialized: `replayTick` fires far more
     * often than a frame takes to decode, and two passes over the same reader would consume
     * each other's frames and apply them out of order. A call arriving mid-pass only raises
     * the target the running pass finishes at, and resolves once that target is reached.
     */
    public advanceTo(totalSeconds: number): Promise<void> {
        if (this.advancing) {
            this.queuedTarget = Math.max(this.queuedTarget ?? totalSeconds, totalSeconds);
            return this.advancing;
        }
        this.advancing = this.runAdvance(totalSeconds);
        return this.advancing;
    }

    private async runAdvance(totalSeconds: number): Promise<void> {
        let target: number | null = totalSeconds;
        try {
            while (target !== null) {
                await this.advanceOnce(target);
                target = this.queuedTarget;
                this.queuedTarget = null;
            }
        } finally {
            // synchronous, so no window exists where the loop has exited but a caller still
            // queues onto it
            this.advancing = null;
        }
    }

    private async advanceOnce(totalSeconds: number): Promise<void> {
        const reader = this.reader;
        if (!reader || this.ended) {
            return;
        }
        const replaySeconds = totalSeconds - this.clockOffset;
        // the clock, not the last frame applied: the position readout moves smoothly between
        // frames instead of stepping once per recorded second
        this.manager.state.replayPosition = Math.min(replaySeconds, this.manager.state.replayDuration);
        let latest = this.currentFrame;
        for (;;) {
            const next = await reader.peekNext();
            if (this.reader !== reader) {
                return; // stopped (or restarted) while decoding
            }
            if (!next) {
                this.ended = true;
                this.applyFrame(latest);
                this.closeReader();
                this.manager.state.speed = 0;
                this.manager.state.message = 'Replay ended';
                return;
            }
            if (next.t > replaySeconds) {
                break;
            }
            latest = await reader.consumeNext();
            if (this.reader !== reader) {
                return;
            }
        }
        this.applyFrame(latest);
    }

    private applyFrame(frame: DecodedFrame | null) {
        if (frame && frame !== this.currentFrame) {
            this.currentFrame = frame;
            this.manager.applyReplayFrame(frame.savedGame);
        }
    }

    /** Tears the replay down and hands `AdminState.speed` back to whatever set it before. */
    public stop(): void {
        this.closeReader();
        this.currentFrame = null;
        this.ended = true;
        this.queuedTarget = null;
        this.manager.state.replayPosition = 0;
        this.manager.state.replayDuration = 0;
        if (this.speedBeforeReplay !== null) {
            this.manager.state.speed = this.speedBeforeReplay;
            this.speedBeforeReplay = null;
        }
    }

    private closeReader() {
        this.reader?.close();
        this.reader = null;
    }
}
