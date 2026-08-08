import * as readline from 'node:readline';

import { GameMap, GameStatus, createLogger } from '@starwards/core/internal';
import { RecordingHeader, parseFrameLine, parseHeader } from './recording-format';

import { GameManager } from '../admin/game-manager';
import { SavedGame } from '../serialization/game-state-protocol';
import { createReadStream } from 'node:fs';
import { stringToSchema } from '../serialization/game-state-serialization';

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
        await this.manager.loadGame(frame0.savedGame, map);
        this.reader = reader;
        this.currentFrame = frame0;
        this.ended = false;
        this.manager.state.gameStatus = GameStatus.REPLAY;
        this.manager.replayTick = (totalSeconds) => {
            this.advanceTo(totalSeconds).catch((e: unknown) => logError('error advancing replay:', e));
        };
    }

    /** Applies the latest frame at or before `totalSeconds`, skipping intermediates. */
    public async advanceTo(totalSeconds: number): Promise<void> {
        if (!this.reader || this.ended) {
            return;
        }
        let latest = this.currentFrame;
        for (;;) {
            const next = await this.reader.peekNext();
            if (!next) {
                this.ended = true;
                if (latest) {
                    this.manager.applyReplayFrame(latest.savedGame);
                }
                this.manager.state.speed = 0;
                this.manager.state.message = 'Replay ended';
                return;
            }
            if (next.t > totalSeconds) {
                break;
            }
            latest = await this.reader.consumeNext();
        }
        if (latest && latest !== this.currentFrame) {
            this.currentFrame = latest;
            this.manager.applyReplayFrame(latest.savedGame);
        }
    }

    public stop(): void {
        this.reader?.close();
        this.reader = null;
    }
}
