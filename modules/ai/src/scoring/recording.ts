import * as fs from 'node:fs';

import { RecordingEventLine, SavedGame, parseEventLine, sidecarName } from '@starwards/core/internal';

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

/** Reads the `.events.jsonl` sidecar beside a `.sgr` recording; none when it is missing. */
export function readEvents(sgrPath: string): RecordingEventLine[] {
    const sidecar = sidecarName(sgrPath);
    if (!fs.existsSync(sidecar)) return [];
    return fs
        .readFileSync(sidecar, 'utf8')
        .split('\n')
        .flatMap((line) => {
            const event = line.trim() ? parseEventLine(line) : null;
            return event ? [event] : [];
        });
}
