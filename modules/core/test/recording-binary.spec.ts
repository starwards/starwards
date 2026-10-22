import {
    BINARY_MAGIC,
    ChunkParser,
    RecordParser,
    RecordingRecord,
    encodeFrameLine,
    encodeHeader,
    encodeRecord,
    frameChunk,
    isBinaryRecording,
    lineToRecord,
    parseHeader,
} from '../src';
import { gzipSync } from 'node:zlib';

const header = {
    format: 'starwards-recording' as const,
    version: 2 as const,
    mapName: 'm',
    startedAt: '2026-08-08T00:00:00.000Z',
    intervalMs: 1000,
};
const records: RecordingRecord[] = [
    { kind: 'header', header },
    { kind: 'frame', t: 1.5, bytes: new Uint8Array([1, 2, 3]) },
    { kind: 'base', t: 1.5, base: { space: new Uint8Array([4]), 'ship:A': new Uint8Array([5, 6]) } },
    { kind: 'seg', t: 1.5, bytes: new Uint8Array([7, 8]) },
];

describe('binary recording records', () => {
    it('round-trips records fed in arbitrary chunks', () => {
        const all = Buffer.concat(records.map((r) => encodeRecord(r)));
        const parser = new RecordParser();
        const out: RecordingRecord[] = [];
        for (let i = 0; i < all.length; i += 5) out.push(...parser.push(all.subarray(i, i + 5)));
        expect(out).toEqual(records);
    });

    it('drops a truncated tail record', () => {
        const all = Buffer.concat(records.map((r) => encodeRecord(r)));
        expect(new RecordParser().push(all.subarray(0, all.length - 1))).toEqual(records.slice(0, 3));
    });

    it('recognises a binary file by its magic, and not a text recording', () => {
        expect(isBinaryRecording(BINARY_MAGIC)).toBe(true);
        expect(isBinaryRecording(new TextEncoder().encode(encodeHeader({ ...header, version: 1 })))).toBe(false);
    });

    it('splits chunks fed in arbitrary pieces and drops a truncated tail', () => {
        const frames = [new Uint8Array([1, 2]), new Uint8Array([3])];
        const all = Buffer.concat([BINARY_MAGIC, ...frames.map(frameChunk)]);
        const parser = new ChunkParser();
        const out: Uint8Array[] = [];
        for (let i = 0; i < all.length - 1; i += 3)
            out.push(...parser.push(all.subarray(i, Math.min(i + 3, all.length - 1))));
        expect(out).toEqual([frames[0]]);
    });

    it('accepts a v2 header', () => {
        expect(parseHeader(encodeHeader(header))).toEqual(header);
    });

    it('reads a text line as the same record as its binary form', async () => {
        const raw = new Uint8Array([9, 9, 9, 1]);
        const line = encodeFrameLine({ t: 2, frame: gzipSync(raw).toString('base64') });
        expect(await lineToRecord(line)).toEqual({ kind: 'frame', t: 2, bytes: raw });
        expect(await lineToRecord(encodeHeader({ ...header, version: 1 }))).toEqual({
            kind: 'header',
            header: { ...header, version: 1 },
        });
        expect(await lineToRecord('{"t":')).toBeNull();
        expect(await lineToRecord('{"t":1,"seg":"Y29ycnVwdA=="}')).toBeNull();
    });
});
