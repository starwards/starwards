import { ArraySchema, MapSchema, Schema } from '@colyseus/schema';
import { getRange, range, rangeSchema, tryGetRange } from '../src/range';
import { JsonPointer } from '../src/json-ptr';
import { expect } from 'chai';
import { gameField } from '../src/game-field';

const RANGE = [-1, 1] as const;
describe('range', () => {
    it('@range([number, number]) for defining literal range to property', () => {
        class Target extends Schema {
            @range(RANGE)
            @gameField('float32')
            property = 0;
        }

        const r = getRange(new Target(), JsonPointer.create('/property'));
        expect(r).to.eql(RANGE);
    });

    it('defining range to getter', () => {
        class Target extends Schema {
            @range(RANGE)
            get property() {
                return 0;
            }
        }

        const r = getRange(new Target(), JsonPointer.create('/property'));
        expect(r).to.eql(RANGE);
    });

    it('@range((this) => [number, number]) for defining dynamic range to property', () => {
        class Target extends Schema {
            @range((t: Target) => t.range)
            @gameField('float32')
            property = 0;

            range = RANGE;
        }

        const r = getRange(new Target(), JsonPointer.create('/property'));
        expect(r).to.eql(RANGE);
    });

    it('@range(SchemaRanges) for defining range on composed models ', () => {
        class ModelWithNoRange extends Schema {
            @gameField('float32')
            property = 0;
        }
        class Target extends Schema {
            @range({ '/property': RANGE })
            @gameField(ModelWithNoRange)
            inner = new ModelWithNoRange();
        }

        const r = getRange(new Target(), JsonPointer.create('/inner/property'));
        expect(r).to.eql(RANGE);
    });

    it('@rangeSchema for defining range on parent or mixin models', () => {
        class ModelWithNoRange extends Schema {
            @gameField('float32')
            property = 0;
        }
        @rangeSchema({ '/property': RANGE })
        class Target extends ModelWithNoRange {}

        const r = getRange(new Target(), JsonPointer.create('/property'));
        expect(r).to.eql(RANGE);
    });
});

describe('ArraySchema JSON pointer support', () => {
    class Inner extends Schema {
        @gameField(['uint8'])
        levels = new ArraySchema<number>(0, 0);
    }

    class Root extends Schema {
        @gameField({ map: Inner })
        items = new MapSchema<Inner>();
    }

    function makeRoot() {
        const root = new Root();
        const inner = new Inner();
        root.items.set('obj1', inner);
        return root;
    }

    it('tryGetRange does not throw for ArraySchema element path', () => {
        const root = makeRoot();
        const pointer = JsonPointer.create('/items/obj1/levels/0');
        // Should return undefined (no range metadata on array elements), not throw
        const result = tryGetRange(root, pointer);
        expect(result).to.equal(undefined);
    });

    it('JsonPointer.set can set values on ArraySchema elements', () => {
        const root = makeRoot();
        const pointer = JsonPointer.create('/items/obj1/levels/0');
        pointer.set(root, 1);
        expect(root.items.get('obj1')!.levels[0]).to.equal(1);
    });

    it('JsonPointer.get can read values from ArraySchema elements', () => {
        const root = makeRoot();
        root.items.get('obj1')!.levels[0] = 2;
        const pointer = JsonPointer.create('/items/obj1/levels/0');
        expect(pointer.get(root)).to.equal(2);
    });
});
