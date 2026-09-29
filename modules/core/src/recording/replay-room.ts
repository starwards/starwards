import { Decoder, Encoder, Schema } from '@colyseus/schema';
import { deepAssignSchema } from './deep-assign-schema';

type Constructor<T extends Schema> = new () => T;

/**
 * Stands in for a Colyseus room whose state is driven by recorded frames instead of a server.
 * Frames are applied onto a local source state, encoded to patches and decoded into the state
 * clients read, so everything that hooks a room's decoder (e.g. colyseus-events' `wireEvents`) fires
 * exactly as it would against a live server. Commands go nowhere.
 */
export class ReplayRoom<S extends Schema> {
    public readonly state: S;
    public readonly serializer: { decoder: Decoder<S> };
    private source: S;
    private encoder: Encoder<S>;
    private listeners = new Set<() => void>();
    private started = false;

    constructor(ctor: Constructor<S>) {
        this.source = new ctor();
        this.encoder = new Encoder(this.source);
        this.state = new ctor();
        this.serializer = { decoder: new Decoder(this.state) };
    }

    readonly onStateChange = Object.assign((cb: () => void) => this.listeners.add(cb), {
        once: (cb: () => void) => {
            if (this.started) {
                // like a room that already received its first state
                queueMicrotask(cb);
                return;
            }
            const wrapped = () => {
                this.listeners.delete(wrapped);
                cb();
            };
            this.listeners.add(wrapped);
        },
    });

    send() {
        // read-only
    }

    onMessage() {
        // the server never speaks here
    }

    /**
     * make the room's state equal `frame`, emitting the changes as a server would.
     * `adjust` may alter the local copy before it is published (e.g. to interpolate); it never touches `frame`.
     */
    apply(frame: S, adjust?: (source: S) => void) {
        deepAssignSchema(this.source, frame);
        adjust?.(this.source);
        const patch = this.started ? this.encoder.encode() : this.encoder.encodeAll();
        this.started = true;
        this.encoder.discardChanges();
        this.serializer.decoder.decode(patch);
        for (const cb of [...this.listeners]) cb();
    }
}
