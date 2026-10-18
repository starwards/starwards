import { POWER_DRAW_EXPONENT } from '../ship/system';

export interface RecordingHeader {
    format: 'starwards-recording';
    version: 1;
    mapName: string;
    startedAt: string;
    intervalMs: number;
    /** Headless runs only: the die seed, so any frame can be resumed deterministically (see `HeadlessGame.restore`). */
    seed?: number;
    /** Headless runs only: the generated scenario parameters this run was built from. */
    params?: unknown;
    /** Headless runs only: simulation ticks per sim-second. */
    hz?: number;
    /** Energy-model parameters the run was simulated under, so readers split runs by mechanics, not by commit. */
    energyModel?: EnergyModel;
    /**
     * Live rooms only: `1` when `base`/`seg` delta lines follow the keyframes (format v2, still `version: 1`
     * so v1 readers play the keyframes). See {@link RecordingBaseLine} and {@link RecordingSegLine}.
     */
    deltas?: 1;
    /** Live rooms only: the rooms' patch interval, i.e. the time resolution of the deltas. */
    patchRateMs?: number;
    /** Live rooms only: the room keys recorded when the recording started (see {@link shipRoomKey}). */
    rooms?: string[];
    /** Live rooms only: hash of the writing build's room schemas; a reader ignores deltas on mismatch. */
    schemaHash?: string;
}

export interface EnergyModel {
    /** See `POWER_DRAW_EXPONENT`. */
    powerDrawExponent: number;
}

/** The energy model this build simulates; every recorder writes it into its header. */
export const currentEnergyModel = (): EnergyModel => ({ powerDrawExponent: POWER_DRAW_EXPONENT });

export interface RecordingFrameLine {
    /** game time (seconds) this frame was captured at, relative to the recording's first frame. */
    t: number;
    /** `schemaToString(SavedGame)` — gzip+base64 encoded Colyseus snapshot. */
    frame: string;
}

/** The space room's key in `base` lines and the header's `rooms`. */
export const SPACE_ROOM_KEY = 'space';

/** A ship room's key in `base` lines and the header's `rooms`. */
export function shipRoomKey(shipId: string) {
    return `ship:${shipId}`;
}

/**
 * The full state of each recorded room, taken right after a patch at (ship rooms: at most one patch
 * interval after) the keyframe with the same `t`. Each value is gzip+base64 of the room's own full-state
 * encoding, which shares refIds with its patches (a v1 keyframe does not). Key order defines the room
 * index used by the segment of the same keyframe.
 */
export interface RecordingBaseLine {
    t: number;
    base: Record<string, string>;
}

/** gzip+base64 of {@link encodeSegment}: the patches recorded after the keyframe with the same `t`. */
export interface RecordingSegLine {
    t: number;
    seg: string;
}

export interface SegmentPatch {
    /** game seconds since the segment's keyframe */
    dt: number;
    /** index of the room in the segment's `base` line key order */
    room: number;
    /** the room's patch bytes, without the leading protocol byte */
    bytes: Uint8Array;
}

const PATCH_HEADER_BYTES = 4 + 1 + 4;

/** Binary segment payload: repeated `[f32 dt][u8 room][u32 len][len bytes]`, little endian. */
export function encodeSegment(patches: SegmentPatch[]): Uint8Array {
    const size = patches.reduce((sum, p) => sum + PATCH_HEADER_BYTES + p.bytes.length, 0);
    const out = new Uint8Array(size);
    const view = new DataView(out.buffer);
    let offset = 0;
    for (const p of patches) {
        view.setFloat32(offset, p.dt, true);
        view.setUint8(offset + 4, p.room);
        view.setUint32(offset + 5, p.bytes.length, true);
        out.set(p.bytes, offset + PATCH_HEADER_BYTES);
        offset += PATCH_HEADER_BYTES + p.bytes.length;
    }
    return out;
}

/** Inverse of {@link encodeSegment}. Throws on a truncated payload. */
export function decodeSegment(bytes: Uint8Array): SegmentPatch[] {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const patches: SegmentPatch[] = [];
    let offset = 0;
    while (offset < bytes.length) {
        if (offset + PATCH_HEADER_BYTES > bytes.length) throw new Error('truncated segment patch header');
        const dt = view.getFloat32(offset, true);
        const room = view.getUint8(offset + 4);
        const len = view.getUint32(offset + 5, true);
        const start = offset + PATCH_HEADER_BYTES;
        if (start + len > bytes.length) throw new Error('truncated segment patch');
        patches.push({ dt, room, bytes: bytes.subarray(start, start + len) });
        offset = start + len;
    }
    return patches;
}

export function encodeBaseLine(line: RecordingBaseLine): string {
    return JSON.stringify(line) + '\n';
}

export function encodeSegLine(line: RecordingSegLine): string {
    return JSON.stringify(line) + '\n';
}

/** Parses a `base` line; `null` for any other line, or a malformed or truncated one. */
export function parseBaseLine(line: string): RecordingBaseLine | null {
    try {
        const parsed = JSON.parse(line) as Partial<RecordingBaseLine> | null;
        if (!parsed || typeof parsed.t !== 'number' || typeof parsed.base !== 'object' || parsed.base === null) {
            return null;
        }
        if (Object.values(parsed.base).some((v) => typeof v !== 'string')) return null;
        return parsed as RecordingBaseLine;
    } catch {
        return null;
    }
}

/** Parses a `seg` line; `null` for any other line, or a malformed or truncated one. */
export function parseSegLine(line: string): RecordingSegLine | null {
    try {
        const parsed = JSON.parse(line) as Partial<RecordingSegLine> | null;
        if (!parsed || typeof parsed.t !== 'number' || typeof parsed.seg !== 'string') {
            return null;
        }
        return parsed as RecordingSegLine;
    } catch {
        return null;
    }
}

export function encodeHeader(header: RecordingHeader): string {
    return JSON.stringify(header) + '\n';
}

export function encodeFrameLine(frame: RecordingFrameLine): string {
    return JSON.stringify(frame) + '\n';
}

export function parseHeader(line: string): RecordingHeader {
    const parsed = JSON.parse(line) as Partial<RecordingHeader>;
    if (parsed.format !== 'starwards-recording' || parsed.version !== 1) {
        throw new Error(`not a starwards-recording header: ${line}`);
    }
    return parsed as RecordingHeader;
}

/**
 * Parses a single frame line. Returns `null` (instead of throwing) for a malformed or
 * truncated line — the last line of an in-progress recording is tolerated as incomplete.
 */
export function parseFrameLine(line: string): RecordingFrameLine | null {
    try {
        const parsed = JSON.parse(line) as Partial<RecordingFrameLine>;
        if (typeof parsed.t !== 'number' || typeof parsed.frame !== 'string') {
            return null;
        }
        return parsed as RecordingFrameLine;
    } catch {
        return null;
    }
}

/** File extension of the sidecar written beside a `.sgr` recording; replay readers never open it. */
export const EVENTS_EXT = '.events.jsonl';

/** File extension of a recording. */
export const RECORDING_EXT = '.sgr';

/** The sidecar's name (or path) beside a recording's; a name without `RECORDING_EXT` gets `EVENTS_EXT` appended. */
export function sidecarName(recordingName: string) {
    const base = recordingName.endsWith(RECORDING_EXT) ? recordingName.slice(0, -RECORDING_EXT.length) : recordingName;
    return base + EVENTS_EXT;
}

/**
 * One timed line of a recording's sidecar. Any module can add its own kinds: the sidecar is kept
 * out of the `.sgr` so replay readers, which expect only frame and delta lines, never see them.
 */
export interface RecordingEventLine {
    /** Game time (seconds) of the tick the event was recorded on. */
    t: number;
    /** Event kind, chosen by the recording module (e.g. `fire_start`, `blast_hit`, `decision`). */
    kind: string;
    /** Space object the event concerns, when it concerns one. */
    objectId?: string;
    /** Kind-specific JSON payload. */
    data?: unknown;
}

export function encodeEventLine(event: RecordingEventLine): string {
    return JSON.stringify(event) + '\n';
}

/**
 * Parses a single sidecar line. Returns `null` (instead of throwing) for a malformed or truncated
 * line, same contract as {@link parseFrameLine}.
 */
export function parseEventLine(line: string): RecordingEventLine | null {
    try {
        const parsed = JSON.parse(line) as Partial<RecordingEventLine> | null;
        if (
            !parsed ||
            typeof parsed.t !== 'number' ||
            typeof parsed.kind !== 'string' ||
            (parsed.objectId !== undefined && typeof parsed.objectId !== 'string')
        ) {
            return null;
        }
        return parsed as RecordingEventLine;
    } catch {
        return null;
    }
}
