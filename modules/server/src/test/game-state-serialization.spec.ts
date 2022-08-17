import { MapSchema, Schema, type } from '@colyseus/schema';
import {
    getUnzipped,
    schemaToString,
    stringToSchema,
    stringToSchemaObject,
} from '../serialization/game-state-serialization';

import { ModelParams } from '@starwards/core';

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
        expect(dist).toEqual(src);
    });

    it('carbon-copy ModelParams', async () => {
        const src = new ModelParams({ k1: 1 });
        const dist = await stringToSchema(ModelParams, await schemaToString(src));
        expect(dist).toEqual(src);
    });

    it('multi carbon-copy ModelParams', async () => {
        const src = new ModelParams({ k1: 1 });
        const firstString = await schemaToString(src);
        const dist1 = await stringToSchema(ModelParams, firstString);
        expect(dist1).toEqual(src);
        const secondString = await schemaToString(dist1);
        expect(await getUnzipped(secondString)).toEqual(await getUnzipped(firstString));
        const dist2 = await stringToSchemaObject(new ModelParams(), secondString);
        expect(dist2).toEqual(src);
    });
});
