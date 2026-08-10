import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';

import { SavedGame } from './game-state-protocol';
import { Vec2 } from '@starwards/core/internal';
import { deepAssignSchema } from './deep-assign-schema';
import { makeDriver } from '../test/driver';

describe('deepAssignSchema', () => {
    it('copies primitive fields', () => {
        const target = new Vec2(0, 0);
        const source = new Vec2(3, 4);
        deepAssignSchema(target, source);
        expect(target.x).toBe(3);
        expect(target.y).toBe(4);
    });

    it('recurses into nested Schema fields (Vec2)', () => {
        class WithVec extends Schema {
            @type(Vec2)
            position = new Vec2(0, 0);
        }
        const target = new WithVec();
        const source = new WithVec();
        source.position = new Vec2(10, 20);
        deepAssignSchema(target, source);
        expect(target.position).not.toBe(source.position); // identity preserved, not replaced
        expect(target.position.x).toBe(10);
        expect(target.position.y).toBe(20);
    });

    it('reconciles a MapSchema: adds new keys, updates existing, removes missing', () => {
        class Item extends Schema {
            @type('number')
            value = 0;
        }
        class Container extends Schema {
            @type({ map: Item })
            items = new MapSchema<Item>();
        }
        const target = new Container();
        target.items.set('a', Object.assign(new Item(), { value: 1 }));
        target.items.set('b', Object.assign(new Item(), { value: 2 }));

        const source = new Container();
        source.items.set('a', Object.assign(new Item(), { value: 100 })); // update
        source.items.set('c', Object.assign(new Item(), { value: 3 })); // add
        // 'b' missing from source -> should be removed

        const originalA = target.items.get('a');
        deepAssignSchema(target, source);

        expect(target.items.get('a')).toBe(originalA); // identity preserved
        expect(target.items.get('a')?.value).toBe(100);
        expect(target.items.get('b')).toBeUndefined();
        expect(target.items.get('c')?.value).toBe(3);
    });

    it('reconciles an ArraySchema of primitives', () => {
        class Container extends Schema {
            @type(['string'])
            ids = new ArraySchema<string>();
        }
        const target = new Container();
        target.ids.push('x', 'y', 'z');
        const source = new Container();
        source.ids.push('a', 'b');
        deepAssignSchema(target, source);
        expect([...target.ids]).toEqual(['a', 'b']);
    });
});

describe('deepAssignSchema round-trip against a live map', () => {
    const gameDriver = makeDriver();

    it('applying a saved game onto a fresh instance matches toJSON', async () => {
        gameDriver.pauseGameCommand();
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        gameDriver.gameManager.update(0);
        gameDriver.gameManager.update(0);

        const source = gameDriver.gameManager.saveGame();
        expect(source).not.toBeNull();

        const target = new SavedGame();
        deepAssignSchema(target, source as SavedGame);

        expect(target.toJSON()).toEqual((source as SavedGame).toJSON());
    });
});
