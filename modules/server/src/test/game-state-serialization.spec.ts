import { MapSchema, Schema } from '@colyseus/schema';
import { schemaToString, stringToSchema } from '../serialization/game-state-serialization';

import { gameField } from 'modules/core/src/game-field';

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
});
