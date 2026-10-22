import * as fs from 'node:fs';
import * as readline from 'node:readline';
import { EVENTS_ZST_EXT, isRecordingName, sidecarName, zstSidecarName } from '@starwards/core/internal';
import { createZstdDecompress, zstdCompressSync, zstdDecompressSync } from 'node:zlib';

const isZst = (file: string) => file.endsWith(EVENTS_ZST_EXT);

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
    return (isZst(file) && data.length ? zstdDecompressSync(data) : data).toString('utf8');
}

/** A sidecar's non-empty lines. */
export function readSidecarLines(file: string): string[] {
    return readSidecar(file)
        .split('\n')
        .filter((line) => line.trim());
}

/** Streams a sidecar's non-empty lines, decompressing a zstd one on the fly. */
export async function* streamSidecarLines(file: string): AsyncGenerator<string> {
    const raw = fs.createReadStream(file);
    const input = isZst(file) && fs.statSync(file).size ? raw.pipe(createZstdDecompress()) : raw;
    const rl = readline.createInterface({ input, crlfDelay: Infinity });
    try {
        for await (const line of rl) if (line.trim()) yield line;
    } finally {
        rl.close();
        raw.destroy();
    }
}

/**
 * Appends text to a sidecar. A zstd sidecar gets one zstd frame per call: concatenated frames are a valid
 * zstd stream, so the file is readable after every append.
 */
export function appendSidecar(file: string, text: string) {
    fs.appendFileSync(file, isZst(file) ? zstdCompressSync(text) : text);
}
