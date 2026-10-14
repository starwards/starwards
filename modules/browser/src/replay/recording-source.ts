import {
    RecordingBaseLine,
    RecordingHeader,
    RecordingSegLine,
    SPACE_ROOM_KEY,
    SavedGame,
    decodeFrame,
    decodeRecordedBytes,
    decodeSegment,
    parseBaseLine,
    parseFrameLine,
    parseHeader,
    parseSegLine,
    reconstructSegment,
    recordingSchemaHash,
} from '@starwards/core';

const MAX_CACHED_FRAMES = 128;

/** the patches after one keyframe (format v2), rebuilt into states all at once when first needed */
interface Segment {
    keyframe: number;
    base: RecordingBaseLine;
    seg: RecordingSegLine;
    /** indexes of this segment's states in the frame list */
    frames: number[];
}

interface FrameEntry {
    t: number;
    /** a keyframe's encoded snapshot */
    raw?: string;
    /** a state rebuilt from a segment's patches: `dt` after the segment's keyframe */
    segment?: Segment;
    dt?: number;
}

/**
 * A parsed recording file. Frames are decoded lazily and only a window of them stays in memory.
 * In a file with deltas (format v2) the frames between keyframes are rebuilt from room patches; a
 * segment that fails to decode shows its keyframe until the next one.
 */
export class RecordingSource {
    private cache = new Map<number, SavedGame>();
    private loading = new Map<number, Promise<SavedGame>>();
    /** called when a background decode finishes, so a paused view can show the frame it was waiting for */
    public onFrameLoaded: (index: number) => void = () => undefined;

    private constructor(
        public readonly name: string,
        public readonly header: RecordingHeader,
        private readonly frames: FrameEntry[],
    ) {}

    static async parse(name: string, text: string): Promise<RecordingSource> {
        const lines = text.split('\n').filter((l) => l.trim().length > 0);
        if (lines.length === 0) {
            throw new Error('empty recording');
        }
        const header = parseHeader(lines[0]);
        const keyframes: FrameEntry[] = [];
        const bases = new Map<number, RecordingBaseLine>();
        const segs = new Map<number, RecordingSegLine>();
        const deltas = header.deltas === 1 && header.schemaHash === recordingSchemaHash();
        for (const line of lines.slice(1)) {
            const parsed = parseFrameLine(line);
            if (parsed) {
                keyframes.push({ t: parsed.t, raw: parsed.frame });
                continue;
            }
            if (!deltas) continue;
            const base = parseBaseLine(line);
            if (base) {
                bases.set(base.t, base);
                continue;
            }
            const seg = parseSegLine(line);
            if (seg) segs.set(seg.t, seg);
        }
        if (keyframes.length === 0) {
            throw new Error('recording has no frames');
        }
        const frames: FrameEntry[] = [];
        for (const [k, keyframe] of keyframes.entries()) {
            frames.push(keyframe);
            const base = bases.get(keyframe.t);
            const seg = segs.get(keyframe.t);
            if (!base || !seg) continue;
            const until = keyframes[k + 1]?.t ?? Infinity;
            const segment: Segment = { keyframe: frames.length - 1, base, seg, frames: [] };
            for (const dt of await stateTimes(base, seg)) {
                if (dt <= 0 || keyframe.t + dt >= until) continue;
                segment.frames.push(frames.length);
                frames.push({ t: keyframe.t + dt, segment, dt });
            }
        }
        return new RecordingSource(name, header, frames);
    }

    get frameCount() {
        return this.frames.length;
    }

    get duration() {
        return this.frames[this.frames.length - 1].t;
    }

    timeOf(index: number) {
        return this.frames[Math.max(0, Math.min(index, this.frames.length - 1))].t;
    }

    /** index of the last frame captured at or before `t` */
    indexAt(t: number): number {
        let lo = 0;
        let hi = this.frames.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (this.frames[mid].t <= t) lo = mid;
            else hi = mid - 1;
        }
        return lo;
    }

    /** the frame if already decoded, otherwise undefined (and a decode is started) */
    peek(index: number): SavedGame | undefined {
        if (index < 0 || index >= this.frames.length) return undefined;
        const hit = this.cache.get(index);
        if (hit) {
            // refresh recency
            this.cache.delete(index);
            this.cache.set(index, hit);
            return hit;
        }
        void this.load(index);
        return undefined;
    }

    load(index: number): Promise<SavedGame> {
        const hit = this.cache.get(index);
        if (hit) return Promise.resolve(hit);
        let pending = this.loading.get(index);
        if (!pending) {
            const entry = this.frames[index];
            const decoded = entry.segment
                ? this.loadSegment(entry.segment, index)
                : decodeFrame(SavedGame, entry.raw ?? '');
            pending = decoded.then((frame) => {
                this.loading.delete(index);
                this.store(index, frame);
                this.onFrameLoaded(index);
                return frame;
            });
            this.loading.set(index, pending);
        }
        return pending;
    }

    /** rebuilds all of a segment's states, caching them; returns the requested one */
    private async loadSegment(segment: Segment, index: number): Promise<SavedGame> {
        const keyframe = await this.load(segment.keyframe);
        let byDt: Map<number, SavedGame>;
        try {
            const states = await reconstructSegment(keyframe, segment.base, segment.seg);
            byDt = new Map(states.map((s) => [s.dt, s.game]));
        } catch {
            byDt = new Map(); // a bad segment: its keyframe stands in until the next one
        }
        const at = (i: number) => byDt.get(this.frames[i].dt ?? 0) ?? keyframe;
        for (const i of segment.frames) {
            if (i !== index && !this.cache.has(i)) this.store(i, at(i));
        }
        return at(index);
    }

    private store(index: number, frame: SavedGame) {
        this.cache.set(index, frame);
        while (this.cache.size > MAX_CACHED_FRAMES) {
            this.cache.delete(this.cache.keys().next().value as number);
        }
    }
}

/** game times (after the keyframe) of the states a segment holds: one per space room patch */
async function stateTimes(base: RecordingBaseLine, seg: RecordingSegLine): Promise<number[]> {
    const space = Object.keys(base.base).indexOf(SPACE_ROOM_KEY);
    try {
        const patches = decodeSegment(await decodeRecordedBytes(seg.seg));
        return [...new Set(patches.filter((p) => p.room === space).map((p) => p.dt))];
    } catch {
        return [];
    }
}
