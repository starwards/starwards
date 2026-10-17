import '../serialization/detach-state-buffers';

import { Encoder, Schema, type } from '@colyseus/schema';

import { SchemaSerializer } from '@colyseus/core';

class State extends Schema {
    @type('uint8') value = 1;
}

describe('detach-state-buffers', () => {
    it('gives every patch and full-state encode bytes of its own', () => {
        const state = new State();
        const serializer = new SchemaSerializer<State>();
        serializer.reset(state);
        const encoder = (serializer as unknown as { encoder: Encoder }).encoder;
        // a payload still queued in a backed-up socket must keep its bytes after later encodes
        const full1 = encoder.encodeAll();
        const full1Bytes = Buffer.from(full1);
        state.value = 200;
        const patch1 = encoder.encode();
        const patch1Bytes = Buffer.from(patch1);
        state.value = 7;
        const patch2 = encoder.encode();
        const full2 = encoder.encodeAll();
        expect(Buffer.compare(full1, full2)).not.toBe(0);
        expect(Buffer.compare(patch1, patch2)).not.toBe(0);
        expect(Buffer.compare(full1, full1Bytes)).toBe(0);
        expect(Buffer.compare(patch1, patch1Bytes)).toBe(0);
    });
});
