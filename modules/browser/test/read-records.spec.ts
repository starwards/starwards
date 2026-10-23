import { BINARY_MAGIC, RecordParser, encodeFrameLine, encodeHeader, encodeRecord, frameChunk } from '@starwards/core';
import { gzipSync, zstdCompressSync } from 'node:zlib';
import { parseRecords } from '../src/replay/read-records';

const header = {
    format: 'starwards-recording' as const,
    version: 1 as const,
    mapName: 'm',
    startedAt: '2026-08-08T00:00:00.000Z',
    intervalMs: 1000,
};
const frame = new Uint8Array(2000).fill(3);

describe('parseRecords', () => {
    it('reads a text recording and a binary one as the same records', async () => {
        const text = new TextEncoder().encode(
            encodeHeader(header) + encodeFrameLine({ t: 1, frame: gzipSync(frame).toString('base64') }),
        );
        const binary = Buffer.concat([
            BINARY_MAGIC,
            ...[
                { kind: 'header' as const, header },
                { kind: 'frame' as const, t: 1, bytes: frame },
            ].map((r) => frameChunk(zstdCompressSync(encodeRecord(r)))),
        ]);
        const expected = [
            { kind: 'header', header },
            { kind: 'frame', t: 1, bytes: frame },
        ];
        expect(await parseRecords(text)).toEqual(expected);
        expect(await parseRecords(binary)).toEqual(expected);
        expect(new RecordParser().push(encodeRecord({ kind: 'frame', t: 1, bytes: frame }))).toHaveLength(1);
    });
});
