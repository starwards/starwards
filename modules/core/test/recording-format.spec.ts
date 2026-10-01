import { encodeEventLine, encodeFrameLine, encodeHeader, parseEventLine, parseFrameLine, parseHeader } from '../src';

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
