import * as readline from 'node:readline';
import {
    BINARY_MAGIC,
    ChunkParser,
    RecordParser,
    RecordingRecord,
    encodeRecord,
    frameChunk,
    isBinaryRecording,
    lineToRecord,
} from '@starwards/core/internal';
import { constants, zstdCompress, zstdCompressSync, zstdDecompress } from 'node:zlib';
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { promisify } from 'node:util';

const compress = promisify(zstdCompress);
const decompress = promisify(zstdDecompress);

/** The first bytes of a binary recording file; written once, before its first chunk. */
export const BINARY_FILE_MAGIC = Buffer.from(BINARY_MAGIC);

/** zstd level of a recording write. */
const ZSTD_LEVEL = 3;

/**
 * One record as a chunk of its own, so a binary recording is appended to like a text one and a crash loses at
 * most the chunk being written.
 */
export async function encodeRecordChunk(record: RecordingRecord): Promise<Buffer> {
    const frame = await compress(encodeRecord(record), { params: { [constants.ZSTD_c_compressionLevel]: ZSTD_LEVEL } });
    return Buffer.from(frameChunk(frame));
}

/** {@link encodeRecordChunk} for callers that write synchronously. */
export function encodeRecordChunkSync(record: RecordingRecord): Buffer {
    const frame = zstdCompressSync(encodeRecord(record), {
        params: { [constants.ZSTD_c_compressionLevel]: ZSTD_LEVEL },
    });
    return Buffer.from(frameChunk(frame));
}

async function isBinaryFile(filePath: string): Promise<boolean> {
    const file = await open(filePath, 'r');
    try {
        const head = Buffer.alloc(4);
        const { bytesRead } = await file.read(head, 0, 4, 0);
        return bytesRead === 4 && isBinaryRecording(head);
    } finally {
        await file.close();
    }
}

interface ReadOptions {
    /** `false` skips inflating the bytes of text-format frames, base and segments (they come back empty). Default `true`. */
    payloads?: boolean;
}

/**
 * Streams a `.sgr` recording's records, header first, from either file format. A truncated tail (a
 * recording still being written, or cut by a crash) is dropped, not thrown.
 */
export async function* readRecords(filePath: string, options: ReadOptions = {}): AsyncGenerator<RecordingRecord> {
    if (await isBinaryFile(filePath)) {
        const chunks = new ChunkParser();
        const records = new RecordParser();
        try {
            for await (const bytes of createReadStream(filePath) as AsyncIterable<Buffer>) {
                for (const frame of chunks.push(bytes)) yield* records.push(await decompress(frame));
            }
        } catch {
            // a corrupt tail (a crash mid-write): what was decoded before it stands
        }
        return;
    }
    const rl = readline.createInterface({
        input: createReadStream(filePath, { encoding: 'utf8' }),
        crlfDelay: Infinity,
    });
    let first = true;
    for await (const line of rl) {
        if (!line.trim()) continue;
        const record = await lineToRecord(line, options.payloads ?? true);
        if (first) {
            if (record?.kind !== 'header') throw new Error(`not a starwards-recording header: ${line}`);
            first = false;
        }
        if (record) yield record;
    }
}
