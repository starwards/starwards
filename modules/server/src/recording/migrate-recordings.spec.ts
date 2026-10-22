import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { encodeFrameLine, encodeHeader, isBinaryRecording } from '@starwards/core/internal';
import { gzipSync } from 'node:zlib';
import { migrateRecordings } from './migrate-recordings';
import { readRecords } from './recording-file';

const header = {
    format: 'starwards-recording' as const,
    version: 1 as const,
    mapName: 'm',
    startedAt: '2026-08-08T00:00:00.000Z',
    intervalMs: 1000,
};

async function all(file: string) {
    const out = [];
    for await (const r of readRecords(file)) out.push(r);
    return out;
}

describe('migrateRecordings', () => {
    let dir: string;
    const textFile = () => path.join(dir, 'sub', 'a.sgr');
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgr-migrate-'));
        fs.mkdirSync(path.join(dir, 'sub'));
        fs.writeFileSync(
            textFile(),
            encodeHeader(header) +
                [0, 1, 2]
                    .map((t) => encodeFrameLine({ t, frame: gzipSync(Buffer.alloc(3000, t)).toString('base64') }))
                    .join(''),
        );
        fs.writeFileSync(path.join(dir, 'sub', 'a.events.jsonl'), '{"t":0,"kind":"x"}\n');
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('converts in place to identical frames in a smaller file, leaving sidecars alone', async () => {
        const before = await all(textFile());
        const size = fs.statSync(textFile()).size;
        const report = await migrateRecordings(dir, {});
        expect(isBinaryRecording(fs.readFileSync(textFile()))).toBe(true);
        expect(fs.statSync(textFile()).size).toBeLessThan(size);
        const after = await all(textFile());
        expect(after.filter((r) => r.kind === 'frame')).toEqual(before.filter((r) => r.kind === 'frame'));
        expect(report).toMatchObject({ converted: 1, skipped: 0, failed: 0, bytesBefore: size });
        expect(fs.readFileSync(path.join(dir, 'sub', 'a.events.jsonl'), 'utf8')).toBe('{"t":0,"kind":"x"}\n');
    });

    it('is idempotent: a converted file is skipped and left untouched', async () => {
        await migrateRecordings(dir, {});
        const bytes = fs.readFileSync(textFile());
        const report = await migrateRecordings(dir, {});
        expect(report).toMatchObject({ converted: 0, skipped: 1 });
        expect(fs.readFileSync(textFile())).toEqual(bytes);
    });

    it('reports savings on --dry-run without writing', async () => {
        const bytes = fs.readFileSync(textFile());
        const report = await migrateRecordings(dir, { dryRun: true });
        expect(report.converted).toBe(1);
        expect(report.bytesAfter).toBeLessThan(report.bytesBefore);
        expect(fs.readFileSync(textFile())).toEqual(bytes);
    });

    it('writes to an output dir, mirroring the tree, when given one', async () => {
        const out = path.join(dir, 'out');
        const bytes = fs.readFileSync(textFile());
        await migrateRecordings(path.join(dir, 'sub'), { outDir: out });
        expect(isBinaryRecording(fs.readFileSync(path.join(out, 'a.sgr')))).toBe(true);
        expect(fs.readFileSync(textFile())).toEqual(bytes);
    });
});
