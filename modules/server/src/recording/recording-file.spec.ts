import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { BINARY_FILE_MAGIC, encodeRecordChunk, readRecords } from './recording-file';
import { RecordingRecord, encodeFrameLine, encodeHeader } from '@starwards/core/internal';
import { gzipSync } from 'node:zlib';

const header = {
    format: 'starwards-recording' as const,
    version: 1 as const,
    mapName: 'm',
    startedAt: '2026-08-08T00:00:00.000Z',
    intervalMs: 1000,
};
const frames = [new Uint8Array([1, 2, 3, 4]), new Uint8Array(5000).fill(7)];

async function collect(file: string, payloads?: boolean) {
    const out: RecordingRecord[] = [];
    for await (const r of readRecords(file, { payloads })) out.push(r);
    return out;
}

describe('recording file', () => {
    let dir: string;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgr-'));
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    const writeText = (file: string) =>
        fs.writeFileSync(
            file,
            encodeHeader(header) +
                frames.map((f, i) => encodeFrameLine({ t: i, frame: gzipSync(f).toString('base64') })).join(''),
        );
    const writeBinary = async (file: string, tail = 0) => {
        const records: RecordingRecord[] = [
            { kind: 'header', header: { ...header, version: 2 } },
            ...frames.map((bytes, t) => ({ kind: 'frame' as const, t, bytes })),
        ];
        const chunks = await Promise.all(records.map(encodeRecordChunk));
        const all = Buffer.concat([BINARY_FILE_MAGIC, ...chunks]);
        fs.writeFileSync(file, tail ? all.subarray(0, all.length - tail) : all);
    };

    it('reads the text and the binary format as the same frames', async () => {
        writeText(path.join(dir, 'a.sgr'));
        await writeBinary(path.join(dir, 'b.sgr'));
        const frameRecords = async (f: string) => (await collect(path.join(dir, f))).filter((r) => r.kind === 'frame');
        expect(await frameRecords('b.sgr')).toEqual(await frameRecords('a.sgr'));
        expect(await frameRecords('b.sgr')).toHaveLength(2);
    });

    it('keeps the frames before a truncated binary tail', async () => {
        await writeBinary(path.join(dir, 'b.sgr'), 10);
        const records = await collect(path.join(dir, 'b.sgr'));
        expect(records.map((r) => r.kind)).toEqual(['header', 'frame']);
    });

    it('can skip inflating payloads of a text recording', async () => {
        writeText(path.join(dir, 'a.sgr'));
        const frame = (await collect(path.join(dir, 'a.sgr'), false)).find((r) => r.kind === 'frame');
        expect(frame).toMatchObject({ kind: 'frame', t: 0, bytes: new Uint8Array(0) });
    });

    it('stores frames smaller than the text format', async () => {
        writeText(path.join(dir, 'a.sgr'));
        await writeBinary(path.join(dir, 'b.sgr'));
        expect(fs.statSync(path.join(dir, 'b.sgr')).size).toBeLessThan(fs.statSync(path.join(dir, 'a.sgr')).size);
    });
});
