import { RecordingEventLine, SavedGame, parseEventLine } from '@starwards/core/internal';

import { findSidecar, readSidecarLines } from '@starwards/server/src/recording/sidecar-file';
import { bytesToSchema } from '@starwards/server/src/serialization/game-state-serialization';
import { readRecords } from '@starwards/server/src/recording/recording-file';

/**
 * Yields a `.sgr` recording's frames one at a time as `SavedGame`s with their time. A truncated tail line is
 * dropped. A long run's decoded frames outgrow the heap together (W-waves: ~1 MB each), so prefer this to
 * {@link readFrames} when one pass is enough.
 */
export async function* streamFrames(path: string): AsyncGenerator<{ t: number; saved: SavedGame }> {
    for await (const record of readRecords(path)) {
        if (record.kind === 'frame') yield { t: record.t, saved: bytesToSchema(SavedGame, record.bytes) };
    }
}

/** Reads a `.sgr` recording's frames as `SavedGame`s with their time. A truncated tail line is dropped. */
export async function readFrames(path: string): Promise<{ t: number; saved: SavedGame }[]> {
    const frames: { t: number; saved: SavedGame }[] = [];
    for await (const frame of streamFrames(path)) frames.push(frame);
    return frames;
}

/** Reads the sidecar (`.events.jsonl` or `.events.jsonl.zst`) beside a `.sgr` recording; none when it is missing. */
export function readEvents(sgrPath: string): RecordingEventLine[] {
    const sidecar = findSidecar(sgrPath);
    if (!sidecar) return [];
    return readSidecarLines(sidecar).flatMap((line) => {
        const event = parseEventLine(line);
        return event ? [event] : [];
    });
}
