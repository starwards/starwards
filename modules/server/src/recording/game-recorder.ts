import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as readline from 'node:readline';

import { PatchTap, RecordingSerializer, recordingDeltasEnabled } from './recording-serializer';
import {
    RecordingHeader,
    SPACE_ROOM_KEY,
    SegmentPatch,
    createLogger,
    currentEnergyModel,
    encodeBaseLine,
    encodeFrameLine,
    encodeHeader,
    encodeSegLine,
    encodeSegment,
    parseFrameLine,
    parseHeader,
    recordingSchemaHash,
} from '@starwards/core/internal';
import { GameManager } from '../admin/game-manager';
import { createReadStream } from 'node:fs';
import { gzip } from 'node:zlib';
import { matchMaker } from '@colyseus/core';
import { promisify } from 'node:util';
import { schemaToString } from '../serialization/game-state-serialization';

const { error: logError } = createLogger('server:game-recorder');

export interface RecordingSummary {
    name: string;
    mapName: string;
    startedAt: string;
    durationSeconds: number;
    frameCount: number;
}

export const RECORDING_EXT = '.sgr';

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

/** A keyframe's delta state: its room bases and the patches recorded after it. */
interface Segment {
    t: number;
    /** recorded rooms, in base order: a patch's room index points here */
    rooms: RecordingSerializer[];
    bases: Map<string, Uint8Array>;
    patches: SegmentPatch[];
    /** ship rooms whose base is taken at their next patch */
    pending: Set<RecordingSerializer>;
    startedWall: number;
    baseWritten: boolean;
    /** the previous segment, whose `seg` line is written right after this segment's `base` */
    prev: Segment | null;
}

/** How long a keyframe's `base` line waits for ship rooms to patch before it is written without them. */
const BASE_WAIT_MS = 250;
/** How long `startRecording` waits for the space room's first patch before recording keyframes only. */
const FIRST_KEYFRAME_WAIT_MS = 2000;

const do_gzip = promisify(gzip);
const gz64 = async (bytes: Uint8Array) => (await do_gzip(bytes)).toString('base64');

/**
 * Records a running game to a JSONL file on a wall-clock interval, for later replay
 * (see `ReplayPlayer`). Owned by the server layer, like `startSnapshotPersistence` — not by
 * `GameManager` — so a stopped game (via any path) is simply the next tick's `saveGame()`
 * returning `null`, which self-finalizes the recording without `GameManager` knowing a
 * recorder exists.
 *
 * With deltas (SPEC-0006, `recordingDeltasEnabled`), each interval only marks a keyframe as due. The
 * keyframe is taken inside the space room's next patch, together with each room's full-state `base`,
 * and the rooms' patches until the next keyframe are written as one `seg` line.
 */
export class GameRecorder implements PatchTap {
    private timer: ReturnType<typeof setInterval> | null = null;
    private inFlight: Promise<unknown> | null = null;
    private filePath: string | null = null;
    private lastWrittenT: number | null = null;
    /** `GameManager.totalSeconds` when this recording started; frame `t` is relative to it. */
    private baseSeconds = 0;
    private deltas = false;
    private keyframeDue = false;
    private segment: Segment | null = null;
    /** delta-mode line writes, in file order */
    private writes: Promise<void> = Promise.resolve();
    private onFirstKeyframe: (() => void) | null = null;

    constructor(
        private manager: GameManager,
        private dir: string,
        private intervalMs = 1000,
        private useDeltas = recordingDeltasEnabled,
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
        const rooms = [...RecordingSerializer.live].map((s) => s.key);
        this.deltas =
            this.useDeltas() &&
            RecordingSerializer.tap === null &&
            rooms.includes(SPACE_ROOM_KEY) &&
            ![...RecordingSerializer.live].some((s) => s.filtered);
        const header: RecordingHeader = {
            format: 'starwards-recording',
            version: 1,
            mapName: savedGame.mapName,
            startedAt,
            intervalMs: this.intervalMs,
            energyModel: currentEnergyModel(),
        };
        if (this.deltas) {
            header.deltas = 1;
            header.patchRateMs = matchMaker.getLocalRoomById(SPACE_ROOM_KEY)?.patchRate ?? undefined;
            header.rooms = [SPACE_ROOM_KEY, ...rooms.filter((k) => k !== SPACE_ROOM_KEY)];
            header.schemaHash = recordingSchemaHash();
        }
        this.lastWrittenT = null;
        this.baseSeconds = this.manager.totalSeconds;
        this.manager.state.isRecordingGame = true;
        this.manager.state.recordingName = filename;
        this.manager.state.recordingSeconds = 0;
        try {
            await fs.writeFile(this.filePath, encodeHeader(header), 'utf-8');
            if (this.deltas && !(await this.firstKeyframe())) {
                this.deltas = false; // the space room never patched: record keyframes only
            }
            if (!this.deltas) await this.writeFrame();
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

    /** sets the tap with a keyframe due; true once that keyframe's frame line is written */
    private firstKeyframe(): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            const timeout = setTimeout(() => {
                this.onFirstKeyframe = null;
                this.keyframeDue = false;
                this.releaseTap();
                resolve(false);
            }, FIRST_KEYFRAME_WAIT_MS);
            this.onFirstKeyframe = () => {
                clearTimeout(timeout);
                resolve(true);
            };
            this.keyframeDue = true;
            RecordingSerializer.tap = this;
        });
    }

    /**
     * Closes the recording and reports what was written, so the GM gets a confirmed result
     * rather than having to go looking for the file. Null when no recording was in progress.
     */
    public async stopRecording(): Promise<RecordingSummary | null> {
        this.clearTimer();
        await this.inFlight;
        await this.endDeltas();
        const filePath = this.filePath;
        this.finalize();
        if (!filePath) return null;
        return await summarizeRecording(filePath, path.basename(filePath));
    }

    private clearTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private releaseTap() {
        if (RecordingSerializer.tap === this) RecordingSerializer.tap = null;
    }

    /** stops taking patches and writes what the current segment holds */
    private async endDeltas() {
        this.releaseTap();
        const segment = this.segment;
        this.segment = null;
        if (segment) {
            this.writeBase(segment);
            this.writeSeg(segment);
        }
        await this.writes;
    }

    /**
     * Closes the current recording. Safe to call from inside a frame write (unlike
     * `stopRecording()`, which awaits the in-flight write and would self-deadlock there).
     * Clearing `filePath` also makes any later stray write a no-op, so nothing can append
     * to a finalized file.
     */
    private finalize() {
        this.clearTimer();
        this.releaseTap();
        this.filePath = null;
        this.lastWrittenT = null;
        this.segment = null;
        this.keyframeDue = false;
        this.deltas = false;
        this.manager.state.isRecordingGame = false;
        this.manager.state.recordingName = '';
        this.manager.state.recordingSeconds = 0;
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
        if (this.deltas) {
            if (this.manager.state.isGameRunning) {
                this.keyframeDue = true;
            } else {
                this.autoFinalizeDeltas();
            }
            return;
        }
        this.inFlight = this.writeFrame()
            .catch((e: unknown) => logError(`error writing recording frame:`, e))
            .finally(() => {
                this.inFlight = null;
            });
    }

    private autoFinalizeDeltas() {
        this.clearTimer();
        this.inFlight = this.endDeltas()
            .catch((e: unknown) => logError(`error writing recording deltas:`, e))
            .finally(() => {
                this.finalize();
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
        this.manager.state.recordingSeconds = t;
    }

    /** {@link PatchTap}: runs synchronously inside a room's patch, so no game tick runs in between */
    public afterPatch(serializer: RecordingSerializer, patch: Uint8Array | null) {
        if (!this.filePath) return;
        const t = this.manager.totalSeconds - this.baseSeconds;
        const segment = this.segment;
        if (segment && patch) {
            const room = segment.rooms.indexOf(serializer);
            if (room >= 0) segment.patches.push({ dt: t - segment.t, room, bytes: patch });
        }
        if (serializer.key === SPACE_ROOM_KEY) {
            if (this.keyframeDue) {
                this.keyframe(serializer, t);
            } else if (segment && !segment.baseWritten && Date.now() - segment.startedWall > BASE_WAIT_MS) {
                this.writeBase(segment); // a ship room that stopped patching is left out of this second
            }
        } else if (segment && segment.pending.delete(serializer)) {
            segment.bases.set(serializer.key, serializer.fullState());
            segment.rooms.push(serializer);
            if (segment.pending.size === 0) this.writeBase(segment);
        }
    }

    private keyframe(space: RecordingSerializer, t: number) {
        this.keyframeDue = false;
        if (this.lastWrittenT !== null && t === this.lastWrittenT) return; // paused: the segment goes on
        // the base first: saveGame() flushes pending entities into the live state
        const spaceBase = space.fullState();
        const savedGame = this.manager.saveGame();
        if (!savedGame) {
            this.autoFinalizeDeltas();
            return;
        }
        const segment: Segment = {
            t,
            rooms: [space],
            bases: new Map([[space.key, spaceBase]]),
            patches: [],
            pending: new Set([...RecordingSerializer.live].filter((s) => s.key !== SPACE_ROOM_KEY)),
            startedWall: Date.now(),
            baseWritten: false,
            prev: this.segment,
        };
        this.segment = segment;
        this.lastWrittenT = t;
        this.manager.state.recordingSeconds = t;
        this.enqueue(async () => encodeFrameLine({ t, frame: await schemaToString(savedGame) }));
        const onFirstKeyframe = this.onFirstKeyframe;
        if (onFirstKeyframe) {
            this.onFirstKeyframe = null;
            this.writes = this.writes.then(onFirstKeyframe);
        }
        if (segment.pending.size === 0) this.writeBase(segment);
    }

    /** writes the segment's `base` line (once), then the previous segment's `seg` line */
    private writeBase(segment: Segment) {
        const prev = segment.prev;
        segment.prev = null;
        if (prev && !prev.baseWritten) this.writeBase(prev);
        if (!segment.baseWritten) {
            segment.baseWritten = true;
            segment.pending.clear();
            const { t } = segment;
            const entries = segment.rooms.map((s) => [s.key, segment.bases.get(s.key)] as const);
            this.enqueue(async () => {
                const base: Record<string, string> = {};
                for (const [key, bytes] of entries) {
                    if (bytes) base[key] = await gz64(bytes);
                }
                return encodeBaseLine({ t, base });
            });
        }
        if (prev) this.writeSeg(prev);
    }

    private writeSeg(segment: Segment) {
        const { t, patches } = segment;
        if (patches.length === 0) return;
        this.enqueue(async () => encodeSegLine({ t, seg: await gz64(encodeSegment(patches)) }));
    }

    private enqueue(line: () => Promise<string>) {
        const filePath = this.filePath;
        if (!filePath) return;
        this.writes = this.writes
            .then(async () => {
                const text = await line();
                if (this.filePath === filePath) await fs.appendFile(filePath, text, 'utf-8');
            })
            .catch((e: unknown) => logError(`error writing recording line:`, e));
    }
}

/**
 * Reads a recording's header and counts its frame lines for the total length. Delta lines (`base`,
 * `seg`) and a truncated tail line are not frames, so only lines that parse as a frame count.
 */
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
            if (!frame) continue;
            frameCount++;
            lastT = frame.t;
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
