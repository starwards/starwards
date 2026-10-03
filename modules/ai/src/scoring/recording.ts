import * as fs from 'node:fs';
import * as readline from 'node:readline';

import {
    EVENTS_EXT,
    RecordingEventLine,
    SavedGame,
    parseEventLine,
    parseFrameLine,
    parseHeader,
} from '@starwards/core/internal';

import { stringToSchema } from '@starwards/server/src/serialization/game-state-serialization';

/** Reads a `.sgr` recording's frames as `SavedGame`s with their time. A truncated tail line is dropped. */
export async function readFrames(path: string): Promise<{ t: number; saved: SavedGame }[]> {
    const rl = readline.createInterface({ input: fs.createReadStream(path, { encoding: 'utf8' }) });
    const frames: { t: number; saved: SavedGame }[] = [];
    let sawHeader = false;
    for await (const line of rl) {
        if (!line.trim()) continue;
        if (!sawHeader) {
            parseHeader(line);
            sawHeader = true;
            continue;
        }
        const frame = parseFrameLine(line);
        if (frame) frames.push({ t: frame.t, saved: await stringToSchema(SavedGame, frame.frame) });
    }
    return frames;
}

/** Reads the `.events.jsonl` sidecar beside a `.sgr` recording; none when it is missing. */
export function readEvents(sgrPath: string): RecordingEventLine[] {
    const sidecar = sgrPath.replace(/\.sgr$/, EVENTS_EXT);
    if (!fs.existsSync(sidecar)) return [];
    return fs
        .readFileSync(sidecar, 'utf8')
        .split('\n')
        .flatMap((line) => {
            const event = line.trim() ? parseEventLine(line) : null;
            return event ? [event] : [];
        });
}
