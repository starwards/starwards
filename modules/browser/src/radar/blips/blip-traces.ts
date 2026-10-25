import { XY } from '@starwards/core';

/** How long a lost contact's trace takes to fade out, unless the radar is configured otherwise. */
export const DEFAULT_TRACE_FADE_MS = 3000;

export type TraceCandidate = { id: string; position: XY; velocity: XY; color: number };

/** A trace as drawn at a moment: where the contact would be now, and how far it has faded (0 fresh, 1 gone). */
type TraceSample = { id: string; position: XY; fade: number; color: number };

type Trace = TraceCandidate & { lostAt: number };

/**
 * Remembers the last scan of every contact that drops out of radar view, so the radar can keep
 * drawing a shadow of it — coasting on its last known velocity — until the trace fades out.
 * Times are in milliseconds, velocities in meters per second.
 */
export class BlipTraces {
    private lastSeen = new Map<string, TraceCandidate>();
    private traces = new Map<string, Trace>();

    constructor(public fadeMs: number) {}

    update<C extends TraceCandidate>(now: number, candidates: Iterable<C>, isVisible: (c: C) => boolean) {
        const existing = new Set<string>();
        for (const c of candidates) {
            existing.add(c.id);
            if (isVisible(c)) {
                this.lastSeen.set(c.id, {
                    id: c.id,
                    position: XY.clone(c.position),
                    velocity: XY.clone(c.velocity),
                    color: c.color,
                });
                this.traces.delete(c.id);
            } else {
                const last = this.lastSeen.get(c.id);
                if (last) {
                    this.lastSeen.delete(c.id);
                    this.traces.set(c.id, { ...last, lostAt: now });
                }
            }
        }
        for (const id of this.lastSeen.keys()) {
            if (!existing.has(id)) this.lastSeen.delete(id);
        }
        for (const [id, trace] of this.traces) {
            if (!existing.has(id) || now - trace.lostAt >= this.fadeMs) this.traces.delete(id);
        }
    }

    *sample(now: number): Iterable<TraceSample> {
        for (const t of this.traces.values()) {
            const age = now - t.lostAt;
            yield {
                id: t.id,
                position: XY.add(t.position, XY.scale(t.velocity, age / 1000)),
                fade: Math.min(1, age / this.fadeMs),
                color: t.color,
            };
        }
    }
}
