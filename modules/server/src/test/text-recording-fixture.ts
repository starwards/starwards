import * as fs from 'node:fs';

import { encodeBaseLine, encodeFrameLine, encodeHeader, encodeSegLine, encodeSegment } from '@starwards/core/internal';
import { gzipSync } from 'node:zlib';
import { readRecords } from '../recording/recording-file';

const gz64 = (bytes: Uint8Array) => gzipSync(bytes).toString('base64');

/**
 * Rewrites a recording in the text (gzip+base64) format, the one written before the binary format.
 * With `deltas`, also adds after each frame a `base` and a `seg` line (placeholder bytes), as a live
 * recorder writes them, and optionally cuts the last line short like an in-progress recording.
 */
export async function writeTextRecording(
    srcPath: string,
    outPath: string,
    { deltas = false, truncateTail = false } = {},
) {
    let out = '';
    for await (const record of readRecords(srcPath)) {
        if (record.kind === 'header') {
            out += encodeHeader({
                ...record.header,
                version: 1,
                ...(deltas && { deltas: 1 as const, patchRateMs: 50, rooms: ['space'] }),
            });
        } else if (record.kind === 'frame') {
            out += encodeFrameLine({ t: record.t, frame: gz64(record.bytes) });
            if (deltas) {
                out += encodeBaseLine({ t: record.t, base: { space: gz64(new Uint8Array([1, 2, 3])) } });
                out += encodeSegLine({
                    t: record.t,
                    seg: gz64(encodeSegment([{ dt: 0.05, room: 0, bytes: new Uint8Array([4, 5]) }])),
                });
            }
        }
    }
    if (truncateTail) out = out.slice(0, out.length - 10);
    fs.writeFileSync(outPath, out, 'utf-8');
}
