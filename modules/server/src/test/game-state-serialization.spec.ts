import { Encoder, MapSchema, Schema } from '@colyseus/schema';
import { schemaToString, stringToSchema } from '../serialization/game-state-serialization';

import { gameField } from '@starwards/core/internal';

describe('game-state-serialization', () => {
    class TestMapSchema extends Schema {
        @gameField({ map: 'number' })
        value = new MapSchema<number>();
    }
    it('carbon-copy MapSchema', async () => {
        const src = new TestMapSchema();
        src.value.set('k1', 1);
        src.value.set('k2', 2);
        const dist = await stringToSchema(TestMapSchema, await schemaToString(src));
        expect(dist.toJSON()).toEqual(src.toJSON());
    });
    it('encodes a state larger than Encoder.BUFFER_SIZE without overflowing more than once', async () => {
        const src = new TestMapSchema();
        for (let i = 0; src.value.size * 16 < 3 * Encoder.BUFFER_SIZE; i++) {
            src.value.set(`key-${i}`, i);
        }
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            for (let i = 0; i < 3; i++) {
                // a fresh tree per call, as `GameManager.saveGame()` clones one per keyframe
                const dist = await stringToSchema(TestMapSchema, await schemaToString(src.clone()));
                expect(dist.toJSON()).toEqual(src.toJSON());
            }
            expect(warn.mock.calls.filter(([m]) => String(m).includes('buffer overflow')).length).toBeLessThanOrEqual(
                1,
            );
        } finally {
            warn.mockRestore();
        }
    });
});
