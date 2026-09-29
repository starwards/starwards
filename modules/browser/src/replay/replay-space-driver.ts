import { SavedGame, SpaceDriver, SpaceState, deepAssignSchema } from '@starwards/core';
import EventEmitter2 from 'eventemitter2';
import { RecordingSource } from './recording-source';
import { Remove } from 'colyseus-events';

const noop = () => undefined;
/** a jump this far between frames is a teleport or a respawn, not motion */
const MAX_INTERPOLATED_JUMP = 1e5;

function lerp(a: number, b: number, alpha: number) {
    return a + (b - a) * alpha;
}

/** interpolates angles (degrees) along the shorter arc */
function lerpAngle(a: number, b: number, alpha: number) {
    const delta = ((((b - a) % 360) + 540) % 360) - 180;
    return a + delta * alpha;
}

/**
 * A read-only `SpaceDriver` fed by a recording instead of a room. It owns one persistent `SpaceState`
 * that recorded frames are applied onto in place, so radar layers holding references to it keep working.
 * Every command channel is a no-op: nothing here can change game state, or reach a server.
 */
export class ReplaySpaceDriver {
    public readonly events = new EventEmitter2({ wildcard: true, delimiter: '/', maxListeners: 0 });
    public readonly state = new SpaceState();
    private appliedIndex = -1;
    private appliedFrame: SavedGame | null = null;
    private ids = new Set<string>();

    constructor(private source: RecordingSource) {}

    /** the driver as radar layers see it */
    get driver(): SpaceDriver {
        return {
            events: this.events,
            state: this.state,
            sendJsonCmd: noop,
            sendGmJsonCmd: noop,
            command: noop,
        };
    }

    /** the frame index currently shown, or -1 before the first frame is decoded */
    get frameIndex() {
        return this.appliedIndex;
    }

    /** true when the frame for `t` is shown */
    update(t: number, interpolate: boolean): boolean {
        const index = this.source.indexAt(t);
        if (index !== this.appliedIndex) {
            const frame = this.source.peek(index);
            if (!frame) return false;
            this.apply(index, frame);
        }
        // decode ahead, so playback never waits on the next frame
        this.source.peek(index + 1);
        this.source.peek(index + 2);
        if (interpolate) this.interpolate(t, index);
        return true;
    }

    private apply(index: number, frame: SavedGame) {
        deepAssignSchema(this.state, frame.fragment.space);
        const ids = new Set<string>();
        for (const object of this.state) ids.add(object.id);
        for (const id of this.ids) {
            if (!ids.has(id)) this.events.emit('$remove', Remove(`/removed/${id}`));
        }
        this.ids = ids;
        this.appliedIndex = index;
        this.appliedFrame = frame;
    }

    private interpolate(t: number, index: number) {
        const next = this.source.peek(index + 1);
        if (!next || !this.appliedFrame) return;
        const t0 = this.source.timeOf(index);
        const t1 = this.source.timeOf(index + 1);
        if (t1 <= t0) return;
        const alpha = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
        const base = this.appliedFrame.fragment.space;
        const target = next.fragment.space;
        for (const object of this.state) {
            const from = base.get(object.id);
            const to = target.get(object.id);
            if (!from || !to || to.type !== from.type) continue;
            if (Math.hypot(to.position.x - from.position.x, to.position.y - from.position.y) > MAX_INTERPOLATED_JUMP) {
                continue;
            }
            object.position.x = lerp(from.position.x, to.position.x, alpha);
            object.position.y = lerp(from.position.y, to.position.y, alpha);
            object.angle = lerpAngle(from.angle, to.angle, alpha);
        }
    }
}
