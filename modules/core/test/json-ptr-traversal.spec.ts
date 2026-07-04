import { ArraySchema, MapSchema, Schema } from '@colyseus/schema';
import { JsonPointer, isJsonPointer } from '../src/json-ptr';
import { commandable, gameField } from '../src/game-field';

import { expect } from 'chai';
import fc from 'fast-check';

// These tests lock in the traversal semantics of JsonPointer.get/set over
// Colyseus@3 containers (MapSchema, ArraySchema) and plain JS objects —
// the code paths used by handleJsonPointerCommand for every remote write.

class Item extends Schema {
    @commandable()
    @gameField('float32')
    val = 0;
}

class Container extends Schema {
    @gameField({ map: Item })
    items = new MapSchema<Item>();

    @gameField(['float32'])
    nums = new ArraySchema<number>();
}

function makeContainer() {
    const c = new Container();
    const item = new Item();
    item.val = 42;
    c.items.set('foo', item);
    c.nums.push(10, 20, 30);
    return c;
}

describe('JsonPointer traversal over Colyseus containers', () => {
    it('get reads through MapSchema by key', () => {
        const c = makeContainer();
        expect(JsonPointer.create('/items/foo/val').get(c)).to.equal(42);
    });

    it('get reads ArraySchema elements by numeric index', () => {
        const c = makeContainer();
        expect(JsonPointer.create('/nums/1').get(c)).to.equal(20);
    });

    it('get returns undefined for missing map keys (mid-path and leaf)', () => {
        const c = makeContainer();
        expect(JsonPointer.create('/items/missing').get(c)).to.equal(undefined);
        expect(JsonPointer.create('/items/missing/val').get(c)).to.equal(undefined);
    });

    it('get throws on a non-numeric ArraySchema index', () => {
        const c = makeContainer();
        expect(() => JsonPointer.create('/nums/abc').get(c)).to.throw(/Invalid array index/);
    });

    it('set writes a @commandable leaf through a MapSchema container and returns the previous value', () => {
        const c = makeContainer();
        const previous = JsonPointer.create('/items/foo/val').set(c, 7);
        expect(previous).to.equal(42);
        expect(c.items.get('foo')!.val).to.equal(7);
    });

    it('set refuses to write directly into a MapSchema', () => {
        const c = makeContainer();
        expect(() => JsonPointer.create('/items/bar').set(c, new Item())).to.throw(/Cannot set property on MapSchema/);
    });

    it('set throws when a mid-path segment is missing', () => {
        const c = makeContainer();
        expect(() => JsonPointer.create('/items/missing/val').set(c, 1)).to.throw(/not found/);
    });

    it('set writes ArraySchema elements by numeric index and returns the previous value', () => {
        const c = makeContainer();
        const previous = JsonPointer.create('/nums/1').set(c, 25);
        expect(previous).to.equal(20);
        expect(c.nums[1]).to.equal(25);
    });

    it('set throws on a non-numeric ArraySchema index', () => {
        const c = makeContainer();
        expect(() => JsonPointer.create('/nums/xyz').set(c, 1)).to.throw(/Invalid array index/);
    });
});

describe('JsonPointer plain-object semantics', () => {
    it('set writes plain object properties and returns the previous value', () => {
        const target = { a: { b: 1 } };
        const previous = JsonPointer.create('/a/b').set(target, 2);
        expect(previous).to.equal(1);
        expect(target.a.b).to.equal(2);
    });

    it('set with force creates missing intermediate containers (array for numeric, object for string)', () => {
        const target = {} as { x?: Array<{ y?: number }> };
        JsonPointer.create('/x/0/y').set(target, 5, true);
        expect(Array.isArray(target.x)).to.equal(true);
        expect(target.x![0].y).to.equal(5);
    });

    it('set without force throws on a missing intermediate segment', () => {
        expect(() => JsonPointer.create('/x/y').set({}, 1)).to.throw(/not found/);
    });

    it('set throws when traversing through a primitive', () => {
        expect(() => JsonPointer.create('/a/b/c').set({ a: 5 }, 1)).to.throw(/Cannot traverse/);
    });

    it('set throws when the final target is a primitive', () => {
        expect(() => JsonPointer.create('/a/b').set({ a: 5 }, 1)).to.throw(/non-object/);
    });

    it('get returns undefined when traversing through a primitive or null', () => {
        expect(JsonPointer.create('/a/b').get({ a: 5 })).to.equal(undefined);
        expect(JsonPointer.create('/a/b').get({ a: null })).to.equal(undefined);
    });
});

describe('JsonPointer encode/decode properties', () => {
    it('decode(encode(path)) preserves all segments (fast-check)', () => {
        fc.assert(
            fc.property(
                fc
                    .array(fc.oneof(fc.string(), fc.nat()), { minLength: 1, maxLength: 5 })
                    // a lone empty segment encodes to '/' which decodes to the root path
                    .filter((path) => !(path.length === 1 && path[0] === '')),
                (path) => {
                    const ptr = JsonPointer.encode(path);
                    expect(isJsonPointer(ptr)).to.equal(true);
                    const decoded = JsonPointer.decode(ptr);
                    expect(decoded.map(String)).to.deep.equal(path.map(String));
                },
            ),
        );
    });

    it('escaping round-trips RFC 6901 corner cases', () => {
        for (const segment of ['~1', '~0', 'a/b', 'a~b', '~01', '/', '~']) {
            const ptr = JsonPointer.encode([segment]);
            expect(JsonPointer.decode(ptr)).to.deep.equal([segment]);
        }
    });
});
