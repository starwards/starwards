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

/**
 * One timed line of a recording's sidecar. Any module can add its own kinds: the sidecar is kept
 * out of the `.sgr` so replay readers, which treat every non-header line as a frame, never see them.
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
