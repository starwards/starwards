import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { appendSidecar, findSidecar, readSidecar, readSidecarLines, streamSidecarLines } from './sidecar-file';
import { zstdCompressSync } from 'node:zlib';

const TEXT = '{"t":0,"kind":"a"}\n{"t":1,"kind":"b"}\n';

describe('sidecar-file', () => {
    let dir: string;
    beforeEach(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sidecar-'))));
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    const write = (name: string, data: string | Buffer) => {
        const file = path.join(dir, name);
        fs.writeFileSync(file, data);
        return file;
    };

    it.each([
        ['plain', 'r.events.jsonl', TEXT],
        ['zstd', 'r.events.jsonl.zst', zstdCompressSync(TEXT)],
    ])('reads a %s sidecar beside a recording', async (_kind, name, data) => {
        const file = write(name, data);
        const sgr = path.join(dir, 'r.sgr');
        expect(findSidecar(sgr)).toBe(file);
        expect(findSidecar(file)).toBe(file);
        expect(readSidecar(file)).toBe(TEXT);
        expect(readSidecarLines(file)).toEqual(['{"t":0,"kind":"a"}', '{"t":1,"kind":"b"}']);
        const streamed: string[] = [];
        for await (const line of streamSidecarLines(file)) streamed.push(line);
        expect(streamed).toEqual(['{"t":0,"kind":"a"}', '{"t":1,"kind":"b"}']);
    });

    it('prefers the zstd sidecar when both exist', () => {
        write('r.events.jsonl', TEXT);
        const zst = write('r.events.jsonl.zst', zstdCompressSync(TEXT));
        expect(findSidecar(path.join(dir, 'r.sgr'))).toBe(zst);
    });

    it('reads an empty zstd sidecar as no lines', async () => {
        const file = write('r.events.jsonl.zst', '');
        expect(readSidecarLines(file)).toEqual([]);
        const streamed: string[] = [];
        for await (const line of streamSidecarLines(file)) streamed.push(line);
        expect(streamed).toEqual([]);
    });

    it('finds no sidecar when none exists', () => {
        expect(findSidecar(path.join(dir, 'r.sgr'))).toBeNull();
    });

    it('appends to a zstd sidecar as concatenated frames that read back whole', () => {
        const file = path.join(dir, 'r.events.jsonl.zst');
        appendSidecar(file, '{"t":0,"kind":"a"}\n');
        appendSidecar(file, '{"t":1,"kind":"b"}\n');
        expect(readSidecar(file)).toBe(TEXT);
    });

    it('appends to a plain sidecar as text', () => {
        const file = path.join(dir, 'r.events.jsonl');
        appendSidecar(file, TEXT);
        expect(fs.readFileSync(file, 'utf8')).toBe(TEXT);
    });
});
