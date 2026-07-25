import { Encoder } from '@colyseus/schema';
import { Packr } from '@colyseus/msgpackr';

/**
 * The room handshake encodes the entire schema reflection into one buffer, and ShipState's tree has
 * outgrown the 8 KB default.
 */
Encoder.BUFFER_SIZE = 32 * 1024;

/**
 * msgpackr keeps `target` (the write buffer) and `targetView` (the DataView floats are written
 * through) in module-level variables, and `Packr.useBuffer()` replaces `target` without refreshing
 * `targetView`. Every `pack()` after such a call writes bytes into the new buffer but floats into
 * the old one, so integers and strings survive the wire while floats arrive as garbage.
 *
 * Colyseus reaches that call in `getMessageBytes[JOIN_ROOM]`, but only when the handshake no longer
 * fits the packr buffer — which is why the corruption appears the moment the schema grows past
 * ~8 KB. Sizing the shared buffer generously up front keeps colyseus off that path.
 *
 * Growing it by packing an oversized payload — rather than handing msgpackr a buffer of our own —
 * lets msgpackr allocate through its own platform allocator, which keeps the two in agreement.
 */
function growSharedPackBuffer(bytes: number) {
    new Packr().encode(new Uint8Array(bytes));
}

growSharedPackBuffer(64 * 1024);
