import {
    decodeSegment,
    encodeBaseLine,
    encodeEventLine,
    encodeFrameLine,
    encodeHeader,
    encodeSegLine,
    encodeSegment,
    isSidecarName,
    parseBaseLine,
    parseEventLine,
    parseFrameLine,
    parseHeader,
    parseSegLine,
    sidecarName,
    zstSidecarName,
} from '../src';

describe('recording-format', () => {
    it('encodes and parses a header round-trip', () => {
        const header = {
            format: 'starwards-recording' as const,
            version: 1 as const,
            mapName: 'test_map_1',
            startedAt: '2026-08-08T00:00:00.000Z',
            intervalMs: 1000,
        };
        const line = encodeHeader(header);
        expect(parseHeader(line)).toEqual(header);
    });

    it('rejects a header with the wrong format tag', () => {
        expect(() => parseHeader(JSON.stringify({ format: 'something-else' }))).toThrow();
    });

    it('encodes and parses a frame line round-trip', () => {
        const frame = { t: 12.5, frame: 'YmFzZTY0' };
        const line = encodeFrameLine(frame);
        expect(parseFrameLine(line)).toEqual(frame);
    });

    it('tolerates a truncated frame line by returning null', () => {
        const line = encodeFrameLine({ t: 1, frame: 'YmFzZTY0' });
        const truncated = line.slice(0, line.length - 5);
        expect(parseFrameLine(truncated)).toBeNull();
    });

    it('returns null for a frame line missing required fields', () => {
        expect(parseFrameLine(JSON.stringify({ t: 1 }))).toBeNull();
    });
});

describe('recording-format sidecar events', () => {
    it('names the sidecar beside a recording', () => {
        expect(sidecarName('map_1.sgr')).toBe('map_1.events.jsonl');
        expect(sidecarName('dir/map_1.sgr')).toBe('dir/map_1.events.jsonl');
        expect(zstSidecarName('dir/map_1.sgr')).toBe('dir/map_1.events.jsonl.zst');
    });

    it('recognises plain and zstd sidecar names', () => {
        expect(isSidecarName('a.events.jsonl')).toBe(true);
        expect(isSidecarName('a.events.jsonl.zst')).toBe(true);
        expect(isSidecarName('a.sgr')).toBe(false);
        expect(isSidecarName('a.jsonl.zst')).toBe(false);
    });

    it('encodes and parses an event line round-trip, keeping arbitrary data', () => {
        const event = { t: 3.25, kind: 'decision', objectId: 'GVTS', data: { any: ['json', 1], nested: { ok: true } } };
        expect(parseEventLine(encodeEventLine(event))).toEqual(event);
    });

    it('parses an event line without objectId or data', () => {
        expect(parseEventLine(encodeEventLine({ t: 0, kind: 'tick' }))).toEqual({ t: 0, kind: 'tick' });
    });

    it('tolerates a truncated event line by returning null', () => {
        const line = encodeEventLine({ t: 1, kind: 'decision', data: { a: 1 } });
        expect(parseEventLine(line.slice(0, line.length - 4))).toBeNull();
    });

    it('returns null for an event line missing required fields', () => {
        expect(parseEventLine(JSON.stringify({ t: 1 }))).toBeNull();
        expect(parseEventLine(JSON.stringify({ kind: 'x' }))).toBeNull();
        expect(parseEventLine('null')).toBeNull();
    });
});

describe('recording-format v2 delta lines', () => {
    const patches = [
        { dt: Math.fround(0.05), room: 0, bytes: new Uint8Array([1, 2, 3]) },
        { dt: 0.0625, room: 1, bytes: new Uint8Array([]) },
        { dt: Math.fround(0.1), room: 0, bytes: new Uint8Array([255, 0, 7, 9]) },
    ];

    it('round-trips a segment', () => {
        expect(decodeSegment(encodeSegment(patches))).toEqual(patches);
    });

    it('rejects a truncated segment payload', () => {
        const bytes = encodeSegment(patches);
        expect(() => decodeSegment(bytes.subarray(0, bytes.length - 1))).toThrow();
        expect(() => decodeSegment(bytes.subarray(0, 3))).toThrow();
    });

    it('parses base and seg lines, and ignores a truncated one', () => {
        const base = { t: 2, base: { space: 'YQ==', 'ship:S1': 'Yg==' } };
        const seg = { t: 2, seg: 'YWJj' };
        expect(parseBaseLine(encodeBaseLine(base))).toEqual(base);
        expect(parseSegLine(encodeSegLine(seg))).toEqual(seg);
        const truncated = encodeSegLine(seg).slice(0, 10);
        expect(parseSegLine(truncated)).toBeNull();
        expect(parseBaseLine(encodeBaseLine(base).slice(0, 10))).toBeNull();
    });

    it('keeps each line kind apart: frame readers skip delta lines and vice versa', () => {
        const baseLine = encodeBaseLine({ t: 1, base: { space: 'YQ==' } });
        const segLine = encodeSegLine({ t: 1, seg: 'YWJj' });
        const frameLine = encodeFrameLine({ t: 1, frame: 'YWJj' });
        expect(parseFrameLine(baseLine)).toBeNull();
        expect(parseFrameLine(segLine)).toBeNull();
        expect(parseBaseLine(frameLine)).toBeNull();
        expect(parseSegLine(frameLine)).toBeNull();
        expect(parseBaseLine(segLine)).toBeNull();
        expect(parseSegLine(baseLine)).toBeNull();
    });

    it('a v2 header is still a version 1 header', () => {
        const header = {
            format: 'starwards-recording' as const,
            version: 1 as const,
            mapName: 'm',
            startedAt: '2026-10-12T00:00:00.000Z',
            intervalMs: 1000,
            deltas: 1 as const,
            patchRateMs: 50,
            rooms: ['space', 'ship:S1'],
            schemaHash: 'abc',
        };
        expect(parseHeader(encodeHeader(header))).toEqual(header);
    });
});
