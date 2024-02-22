import { getRange, range, rangeSchema } from '../src/range';

import { JsonPointer } from 'json-ptr';
import { Schema } from '@colyseus/schema';
import { expect } from 'chai';
import { gameField } from '../src/game-field';

const RANGE = [-1, 1] as const;
describe('range', () => {
    it('@range([number, number]) for defining literal range to property', () => {
        class Target extends Schema {
            @gameField('float32')
            @range(RANGE)
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
            @gameField('float32')
            @range((t: Target) => t.range)
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
            @gameField(ModelWithNoRange)
            @range({ '/property': RANGE })
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
