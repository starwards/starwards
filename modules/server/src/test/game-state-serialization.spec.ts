import { Encoder, MapSchema, Schema } from '@colyseus/schema';
import { gameField, isBinarySavedGame } from '@starwards/core/internal';
import {
    savedGameToSchema,
    schemaToSavedGame,
    schemaToString,
    stringToSchema,
} from '../serialization/game-state-serialization';

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

describe('saved game files', () => {
    class TestMapSchema extends Schema {
        @gameField({ map: 'number' })
        value = new MapSchema<number>();
    }
    const source = () => {
        const src = new TestMapSchema();
        src.value.set('k1', 1);
        src.value.set('k2', 2);
        return src;
    };

    it('round-trips the binary form behind the magic prefix', async () => {
        const file = await schemaToSavedGame(source());
        expect(isBinarySavedGame(file)).toBe(true);
        expect((await savedGameToSchema(TestMapSchema, file)).toJSON()).toEqual(source().toJSON());
    });

    it('still reads the older base64+gzip text form', async () => {
        const file = Buffer.from(await schemaToString(source()), 'utf-8');
        expect(isBinarySavedGame(file)).toBe(false);
        expect((await savedGameToSchema(TestMapSchema, file)).toJSON()).toEqual(source().toJSON());
    });

    it('rejects a truncated binary file', async () => {
        const file = await schemaToSavedGame(source());
        await expect(savedGameToSchema(TestMapSchema, file.subarray(0, file.length - 4))).rejects.toThrow();
    });

    it('rejects a corrupt text file', async () => {
        await expect(savedGameToSchema(TestMapSchema, Buffer.from('not a saved game'))).rejects.toThrow();
    });
});
