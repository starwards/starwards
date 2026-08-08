export interface RecordingHeader {
    format: 'starwards-recording';
    version: 1;
    mapName: string;
    startedAt: string;
    intervalMs: number;
}

interface RecordingFrameLine {
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
