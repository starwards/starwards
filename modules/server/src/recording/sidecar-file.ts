import * as fs from 'node:fs';
import * as readline from 'node:readline';
import { EVENTS_ZST_EXT, isRecordingName, sidecarName, zstSidecarName } from '@starwards/core/internal';
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib';

const isZst = (file: string) => file.endsWith(EVENTS_ZST_EXT);

const ZSTD_MAGIC = 0xfd2fb528;
const isSkippableMagic = (magic: number) => (magic & 0xfffffff0) === 0x184d2a50;

/**
 * End offset of the zstd frame starting at `start`, walked from its header and block headers (RFC 8878);
 * `null` when the data ends inside it or is not a frame.
 */
function frameEnd(data: Buffer, start: number): number | null {
    if (data.length < start + 8) return null;
    const magic = data.readUInt32LE(start);
    if (isSkippableMagic(magic)) {
        const end = start + 8 + data.readUInt32LE(start + 4);
        return end <= data.length ? end : null;
    }
    if (magic !== ZSTD_MAGIC) return null;
    const descriptor = data[start + 4];
    const singleSegment = (descriptor >> 5) & 1;
    const fcsSize = [singleSegment, 2, 4, 8][descriptor >> 6];
    const dictIdSize = [0, 1, 2, 4][descriptor & 3];
    let at = start + 5 + (singleSegment ? 0 : 1) + dictIdSize + fcsSize;
    for (let last = false; !last;) {
        if (at + 3 > data.length) return null;
        const block = data.readUIntLE(at, 3);
        last = !!(block & 1);
        const type = (block >> 1) & 3;
        if (type === 3) return null;
        at += 3 + (type === 1 ? 1 : block >>> 3);
    }
    if ((descriptor >> 2) & 1) at += 4;
    return at <= data.length ? at : null;
}

/**
 * Decompresses a sidecar's zstd frames one at a time. Each frame is decompressed on its own: Node's zstd
 * decoder stops after the first frame of a concatenation in some versions. A truncated final frame (a run
 * killed mid-append) is dropped; the frames before it are kept.
 */
function* inflateFrames(data: Buffer): Generator<Buffer> {
    for (let start = 0, end = frameEnd(data, 0); end !== null; start = end, end = frameEnd(data, start)) {
        if (!isSkippableMagic(data.readUInt32LE(start))) yield zstdDecompressSync(data.subarray(start, end));
    }
}

/**
 * The sidecar file of a recording (`x.sgr`), zstd-compressed (`x.events.jsonl.zst`) before plain (`x.events.jsonl`),
 * or `recordingOrSidecar` itself when it is a sidecar path; `null` when that file does not exist.
 */
export function findSidecar(recordingOrSidecar: string): string | null {
    const candidates = isRecordingName(recordingOrSidecar)
        ? [zstSidecarName(recordingOrSidecar), sidecarName(recordingOrSidecar)]
        : [recordingOrSidecar];
    return candidates.find((file) => fs.existsSync(file)) ?? null;
}

/** A sidecar's text, decompressed when it is zstd. */
export function readSidecar(file: string): string {
    const data = fs.readFileSync(file);
    return (isZst(file) ? Buffer.concat([...inflateFrames(data)]) : data).toString('utf8');
}

/** A sidecar's non-empty lines. */
export function readSidecarLines(file: string): string[] {
    return readSidecar(file)
        .split('\n')
        .filter((line) => line.trim());
}

/** Streams a sidecar's non-empty lines; a zstd one is decompressed a frame at a time. */
export async function* streamSidecarLines(file: string): AsyncGenerator<string> {
    if (isZst(file)) {
        const decoder = new TextDecoder();
        let partial = '';
        for (const frame of inflateFrames(fs.readFileSync(file))) {
            const lines = (partial + decoder.decode(frame, { stream: true })).split('\n');
            partial = lines.pop()!;
            for (const line of lines) if (line.trim()) yield line;
        }
        partial += decoder.decode();
        if (partial.trim()) yield partial;
        return;
    }
    const raw = fs.createReadStream(file);
    const rl = readline.createInterface({ input: raw, crlfDelay: Infinity });
    try {
        for await (const line of rl) if (line.trim()) yield line;
    } finally {
        rl.close();
        raw.destroy();
    }
}

/**
 * Appends text to a sidecar. A zstd sidecar gets one zstd frame per call: the file is a plain run of zstd frames
 * (`zstd -dc` reads it), readable after every append.
 */
export function appendSidecar(file: string, text: string) {
    fs.appendFileSync(file, isZst(file) ? zstdCompressSync(text) : text);
}
