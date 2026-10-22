import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { BINARY_FILE_MAGIC, encodeRecordChunk, readRecords } from './recording-file';
import { RecordingRecord, isBinaryRecording, isRecordingName } from '@starwards/core/internal';

interface MigrateOptions {
    /** Write the converted files here, mirroring the tree under the source, instead of replacing in place. */
    outDir?: string;
    /** Report what would be converted and the size saved, writing nothing. */
    dryRun?: boolean;
    /** Called once per file with what happened to it. */
    onFile?: (file: string, outcome: 'converted' | 'skipped' | 'failed', detail?: string) => void;
}

interface MigrateReport {
    converted: number;
    skipped: number;
    failed: number;
    bytesBefore: number;
    bytesAfter: number;
}

async function* recordingFiles(root: string): AsyncGenerator<string> {
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) {
        yield root;
        return;
    }
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
        const full = path.join(root, entry.name);
        if (entry.isDirectory()) yield* recordingFiles(full);
        else if (entry.isFile() && isRecordingName(entry.name)) yield full;
    }
}

async function startsBinary(file: string): Promise<boolean> {
    const handle = await fs.open(file, 'r');
    try {
        const head = Buffer.alloc(BINARY_FILE_MAGIC.length);
        await handle.read(head, 0, head.length, 0);
        return isBinaryRecording(head);
    } finally {
        await handle.close();
    }
}

/** What a record becomes in the binary format: the same, with the header marking the new version. */
const asBinary = (record: RecordingRecord): RecordingRecord =>
    record.kind === 'header' ? { kind: 'header', header: { ...record.header, version: 2 } } : record;

async function* binaryChunks(src: string): AsyncGenerator<Buffer> {
    yield BINARY_FILE_MAGIC;
    for await (const record of readRecords(src)) yield await encodeRecordChunk(asBinary(record));
}

/** Throws unless `converted` reads back as exactly the records of `src`. */
async function verifyRoundTrip(src: string, converted: string) {
    const original = readRecords(src);
    const copy = readRecords(converted);
    for (;;) {
        const [a, b] = await Promise.all([original.next(), copy.next()]);
        if (a.done || b.done) {
            if (a.done && b.done) return;
            throw new Error('converted file has a different number of records');
        }
        if (!sameRecord(asBinary(a.value), b.value)) throw new Error(`record mismatch (${a.value.kind})`);
    }
}

function sameRecord(a: RecordingRecord, b: RecordingRecord): boolean {
    if (a.kind === 'header' || b.kind === 'header') {
        return JSON.stringify(a) === JSON.stringify(b);
    }
    if (a.kind !== b.kind || a.t !== b.t) return false;
    const bytesOf = (r: RecordingRecord) =>
        r.kind === 'base' ? Object.entries(r.base) : r.kind === 'header' ? [] : ([['', r.bytes]] as const);
    const [x, y] = [bytesOf(a), bytesOf(b)];
    return (
        x.length === y.length && x.every(([key, bytes], i) => key === y[i][0] && Buffer.compare(bytes, y[i][1]) === 0)
    );
}

/**
 * Converts the text-format (gzip+base64) `.sgr` files under `root` (a file or a directory, recursively) to
 * the binary format. Binary files are skipped, so a run can be repeated or resumed. Each conversion is
 * written beside its target, verified to read back as identical records, and only then moved into place.
 */
export async function migrateRecordings(root: string, options: MigrateOptions): Promise<MigrateReport> {
    const report: MigrateReport = { converted: 0, skipped: 0, failed: 0, bytesBefore: 0, bytesAfter: 0 };
    const rootIsDir = (await fs.stat(root)).isDirectory();
    for await (const src of recordingFiles(root)) {
        const dest = options.outDir
            ? path.join(options.outDir, rootIsDir ? path.relative(root, src) : path.basename(src))
            : src;
        try {
            if (await startsBinary(src)) {
                report.skipped++;
                options.onFile?.(src, 'skipped');
                continue;
            }
            const before = (await fs.stat(src)).size;
            let after = 0;
            if (options.dryRun) {
                for await (const chunk of binaryChunks(src)) after += chunk.length;
            } else {
                await fs.mkdir(path.dirname(dest), { recursive: true });
                const tmp = `${dest}.migrating`;
                try {
                    const out = await fs.open(tmp, 'w');
                    try {
                        for await (const chunk of binaryChunks(src)) {
                            await out.write(chunk);
                            after += chunk.length;
                        }
                    } finally {
                        await out.close();
                    }
                    await verifyRoundTrip(src, tmp);
                    await fs.rename(tmp, dest);
                } catch (e) {
                    await fs.rm(tmp, { force: true });
                    throw e;
                }
            }
            report.converted++;
            report.bytesBefore += before;
            report.bytesAfter += after;
            options.onFile?.(src, 'converted', `${before} -> ${after} bytes`);
        } catch (e) {
            report.failed++;
            options.onFile?.(src, 'failed', String(e));
        }
    }
    return report;
}
