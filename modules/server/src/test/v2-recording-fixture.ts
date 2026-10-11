import * as fs from 'node:fs';

import {
    encodeBaseLine,
    encodeHeader,
    encodeSegLine,
    encodeSegment,
    parseFrameLine,
    parseHeader,
} from '@starwards/core/internal';

import { gzipSync } from 'node:zlib';

const gz64 = (bytes: Uint8Array) => gzipSync(bytes).toString('base64');

/**
 * Rewrites a v1 recording as a format-v2 file: same header plus `deltas: 1`, and after each frame a
 * `base` and a `seg` line (placeholder bytes), as a live recorder writes them. Optionally cuts the last
 * line short, like an in-progress recording. For checking that keyframe readers skip delta lines.
 */
export function writeV2Fixture(v1Path: string, outPath: string, { truncateTail = false } = {}) {
    const [headerLine, ...rest] = fs
        .readFileSync(v1Path, 'utf-8')
        .split('\n')
        .filter((l) => l.length > 0);
    let out = encodeHeader({ ...parseHeader(headerLine), deltas: 1, patchRateMs: 50, rooms: ['space'] });
    for (const line of rest) {
        const frame = parseFrameLine(line);
        if (!frame) continue;
        out += line + '\n';
        out += encodeBaseLine({ t: frame.t, base: { space: gz64(new Uint8Array([1, 2, 3])) } });
        out += encodeSegLine({
            t: frame.t,
            seg: gz64(encodeSegment([{ dt: 0.05, room: 0, bytes: new Uint8Array([4, 5]) }])),
        });
    }
    if (truncateTail) out = out.slice(0, out.length - 10);
    fs.writeFileSync(outPath, out, 'utf-8');
}
