import { RecordingHeader, parseBaseLine, parseFrameLine, parseHeader, parseSegLine } from './recording-format';
import { decodeRecordedBytes } from './decode-frame';

/**
 * A recording's content with payloads as raw bytes, whichever file format carried it. A text (gzip+base64)
 * recording and a binary (zstd) one read as the same records, so readers never see the difference.
 */
export type RecordingRecord =
    | { kind: 'header'; header: RecordingHeader }
    /** A keyframe: the Colyseus snapshot of a `SavedGame`. */
    | { kind: 'frame'; t: number; bytes: Uint8Array }
    /** The room bases of the keyframe at `t`, see `RecordingBaseLine`. */
    | { kind: 'base'; t: number; base: Record<string, Uint8Array> }
    /** The patches after the keyframe at `t`, see `encodeSegment`. */
    | { kind: 'seg'; t: number; bytes: Uint8Array };

const KIND_HEADER = 0;
const KIND_FRAME = 1;
const KIND_BASE = 2;
const KIND_SEG = 3;

/**
 * First bytes of a binary (second format) recording: what tells it from a text one, which starts with `{`.
 * After it come chunks, each `[u32 length][zstd frame of whole records]`.
 */
export const BINARY_MAGIC = new Uint8Array([0x53, 0x47, 0x52, 0x02]);

/** True when the file starts with {@link BINARY_MAGIC}, i.e. is a binary recording. */
export function isBinaryRecording(head: Uint8Array): boolean {
    return BINARY_MAGIC.every((b, i) => head[i] === b);
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function concat(parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
    let offset = 0;
    for (const p of parts) {
        out.set(p, offset);
        offset += p.length;
    }
    return out;
}

function f64(t: number): Uint8Array {
    const out = new Uint8Array(8);
    new DataView(out.buffer).setFloat64(0, t, true);
    return out;
}

function u32(n: number): Uint8Array {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, n, true);
    return out;
}

function payloadOf(record: RecordingRecord): Uint8Array {
    switch (record.kind) {
        case 'header':
            return textEncoder.encode(JSON.stringify(record.header));
        case 'frame':
        case 'seg':
            return concat([f64(record.t), record.bytes]);
        case 'base': {
            const parts = [f64(record.t), new Uint8Array([Object.keys(record.base).length])];
            for (const [key, bytes] of Object.entries(record.base)) {
                const name = textEncoder.encode(key);
                parts.push(new Uint8Array([name.length]), name, u32(bytes.length), bytes);
            }
            return concat(parts);
        }
    }
}

const KIND_OF: Record<RecordingRecord['kind'], number> = {
    header: KIND_HEADER,
    frame: KIND_FRAME,
    base: KIND_BASE,
    seg: KIND_SEG,
};

/** `[u8 kind][u32 payload length][payload]`, little endian. The file wraps a sequence of these in zstd frames. */
export function encodeRecord(record: RecordingRecord): Uint8Array {
    const payload = payloadOf(record);
    return concat([new Uint8Array([KIND_OF[record.kind]]), u32(payload.length), payload]);
}

function decodePayload(kind: number, payload: Uint8Array): RecordingRecord | null {
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    switch (kind) {
        case KIND_HEADER:
            return { kind: 'header', header: parseHeader(textDecoder.decode(payload)) };
        case KIND_FRAME:
            return { kind: 'frame', t: view.getFloat64(0, true), bytes: payload.subarray(8) };
        case KIND_SEG:
            return { kind: 'seg', t: view.getFloat64(0, true), bytes: payload.subarray(8) };
        case KIND_BASE: {
            const base: Record<string, Uint8Array> = {};
            let offset = 9;
            for (let n = view.getUint8(8); n > 0; n--) {
                const nameLen = view.getUint8(offset);
                const key = textDecoder.decode(payload.subarray(offset + 1, offset + 1 + nameLen));
                const len = view.getUint32(offset + 1 + nameLen, true);
                const start = offset + 5 + nameLen;
                base[key] = payload.subarray(start, start + len);
                offset = start + len;
            }
            return { kind: 'base', t: view.getFloat64(0, true), base };
        }
        default:
            return null; // a kind from a newer writer: skipped
    }
}

/** Wraps a zstd frame as one chunk of a binary recording. */
export function frameChunk(zstdFrame: Uint8Array): Uint8Array {
    return concat([u32(zstdFrame.length), zstdFrame]);
}

/**
 * Splits a binary recording's bytes into its zstd frames, the magic included in the first push. A chunk is
 * its own frame because decoders stop at the end of the first frame of a concatenation.
 */
export class ChunkParser {
    private pending: Uint8Array = new Uint8Array(0);
    private sawMagic = false;

    /** The frames completed by `bytes`. A truncated tail stays pending and is never returned. */
    push(bytes: Uint8Array): Uint8Array[] {
        let buf = this.pending.length ? concat([this.pending, bytes]) : bytes;
        if (!this.sawMagic) {
            if (buf.length < BINARY_MAGIC.length) {
                this.pending = buf;
                return [];
            }
            if (!isBinaryRecording(buf)) throw new Error('not a binary starwards recording');
            this.sawMagic = true;
            buf = buf.subarray(BINARY_MAGIC.length);
        }
        const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        const out: Uint8Array[] = [];
        let offset = 0;
        while (offset + 4 <= buf.length) {
            const len = view.getUint32(offset, true);
            if (offset + 4 + len > buf.length) break;
            out.push(buf.subarray(offset + 4, offset + 4 + len));
            offset += 4 + len;
        }
        this.pending = buf.slice(offset);
        return out;
    }
}

/** Incremental decoder of {@link encodeRecord} output: a record split across chunks waits for the rest. */
export class RecordParser {
    private pending: Uint8Array = new Uint8Array(0);

    /** The records completed by `chunk`. A truncated tail stays pending and is never returned. */
    push(chunk: Uint8Array): RecordingRecord[] {
        const bytes = this.pending.length ? concat([this.pending, chunk]) : chunk;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const out: RecordingRecord[] = [];
        let offset = 0;
        while (offset + 5 <= bytes.length) {
            const len = view.getUint32(offset + 1, true);
            if (offset + 5 + len > bytes.length) break;
            const record = decodePayload(bytes[offset], bytes.subarray(offset + 5, offset + 5 + len));
            if (record) out.push(record);
            offset += 5 + len;
        }
        this.pending = bytes.slice(offset);
        return out;
    }
}

/**
 * Reads one line of a text (gzip+base64) recording as a record; `null` for a malformed or truncated line.
 * `payloads: false` skips inflating frame, base and segment bytes, which come back empty.
 */
export async function lineToRecord(line: string, payloads = true): Promise<RecordingRecord | null> {
    const inflate = async (text: string) => (payloads ? await decodeRecordedBytes(text) : new Uint8Array(0));
    const frame = parseFrameLine(line);
    if (frame) return { kind: 'frame', t: frame.t, bytes: await inflate(frame.frame) };
    const base = parseBaseLine(line);
    if (base) {
        const decoded: Record<string, Uint8Array> = {};
        for (const [key, text] of Object.entries(base.base)) decoded[key] = await inflate(text);
        return { kind: 'base', t: base.t, base: decoded };
    }
    const seg = parseSegLine(line);
    if (seg) return { kind: 'seg', t: seg.t, bytes: await inflate(seg.seg) };
    try {
        return { kind: 'header', header: parseHeader(line) };
    } catch {
        return null;
    }
}
