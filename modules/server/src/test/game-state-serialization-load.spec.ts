import { Encoder, MapSchema, Schema } from '@colyseus/schema';
import { decodedCopy, stringToSchema } from '../serialization/game-state-serialization';

import { gameField } from '@starwards/core/internal';
import { gzipSync } from 'node:zlib';

/** Its own file, so the module's shared encode buffer starts at `Encoder.BUFFER_SIZE` (jest isolates modules per file). */
describe('game-state-serialization: loading a save', () => {
    class TestMapSchema extends Schema {
        @gameField({ map: 'number' })
        value = new MapSchema<number>();
    }
    it('sizes decodedCopy from the loaded save so it does not overflow', async () => {
        const src = new TestMapSchema();
        for (let i = 0; src.value.size * 16 < 3 * Encoder.BUFFER_SIZE; i++) {
            src.value.set(`save-${i}`, i);
        }
        // a save written by another process: this module's buffer has not seen its size
        const saved = gzipSync(new Encoder(src).encodeAll(), {}).toString('base64');
        const loaded = await stringToSchema(TestMapSchema, saved);
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            expect(decodedCopy(TestMapSchema, loaded).toJSON()).toEqual(src.toJSON());
            expect(warn.mock.calls.filter(([m]) => String(m).includes('buffer overflow'))).toEqual([]);
        } finally {
            warn.mockRestore();
        }
    });
});
