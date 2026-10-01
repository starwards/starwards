import { RecordingHeader, SavedGame, decodeFrame, parseFrameLine, parseHeader } from '@starwards/core';

const MAX_CACHED_FRAMES = 64;

interface FrameEntry {
    t: number;
    raw: string;
}

/** A parsed recording file. Frames are decoded lazily and only a window of them stays in memory. */
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

    static parse(name: string, text: string): RecordingSource {
        const lines = text.split('\n').filter((l) => l.trim().length > 0);
        if (lines.length === 0) {
            throw new Error('empty recording');
        }
        const header = parseHeader(lines[0]);
        const frames: FrameEntry[] = [];
        for (const line of lines.slice(1)) {
            const parsed = parseFrameLine(line);
            if (parsed) {
                frames.push({ t: parsed.t, raw: parsed.frame });
            }
        }
        if (frames.length === 0) {
            throw new Error('recording has no frames');
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
            pending = decodeFrame(SavedGame, this.frames[index].raw).then((frame) => {
                this.loading.delete(index);
                this.cache.set(index, frame);
                while (this.cache.size > MAX_CACHED_FRAMES) {
                    this.cache.delete(this.cache.keys().next().value as number);
                }
                this.onFrameLoaded(index);
                return frame;
            });
            this.loading.set(index, pending);
        }
        return pending;
    }
}
