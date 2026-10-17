import { Encoder, Schema } from '@colyseus/schema';
import { SchemaSerializer } from '@colyseus/core';

/**
 * Colyseus encodes each room's state patches (and its cached full state) into one reusable buffer
 * and passes a view of it straight to `ws`. Node only writes that view out synchronously while the
 * socket keeps up; once a client falls behind (a busy browser tab, a slow link) the view sits in the
 * socket's write queue while the next tick's encode overwrites the same bytes. The client then
 * decodes a later patch in place of the queued one, misses ADD operations, and fails with
 * `"refId" not found` until it rejoins.
 *
 * Copying each encoded payload once, before any client gets it, gives every queued send bytes of
 * its own. Still current in @colyseus/core 0.18 (fullEncodeBuffer/sharedBuffer reused, ws-transport
 * `raw()` sends without copying). Locked down by test/state-patch-backpressure.spec.ts.
 */
// eslint-disable-next-line @typescript-eslint/unbound-method -- re-bound via apply below
const reset = SchemaSerializer.prototype.reset;
SchemaSerializer.prototype.reset = function (this: SchemaSerializer<Schema>, ...args) {
    reset.apply(this, args);
    const encoder = this.encoder as Encoder;
    // schema 5's full-state paths (encodeAll -> encodeFullSync, and the StateView variants) never go
    // through encode() and return views of their own reused buffers, so each is copied too.
    for (const method of ['encode', 'encodeAll', 'encodeAllView', 'encodeView'] as const) {
        const original = encoder[method] as (...a: unknown[]) => Uint8Array;
        (encoder[method] as unknown) = function (this: Encoder, ...a: unknown[]) {
            return Buffer.from(original.apply(this, a));
        };
    }
};
