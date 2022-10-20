import { MapSchema, Schema, type } from '@colyseus/schema';
import { schemaToString, stringToSchema } from '../serialization/game-state-serialization';

describe('game-state-serialization', () => {
    class TestMapSchema extends Schema {
        @type({ map: 'number' })
        value = new MapSchema<number>();
    }
    it('carbon-copy MapSchema', async () => {
        const src = new TestMapSchema();
        src.value.set('k1', 1);
        src.value.set('k2', 2);
        const dist = await stringToSchema(TestMapSchema, await schemaToString(src));
        expect(dist.toJSON()).toEqual(src.toJSON());
    });
});
