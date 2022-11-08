import { ArraySchema, Schema, type } from '@colyseus/schema';
import { DesignState, defectible, getSystems } from '../src/ship/system';

import { expect } from 'chai';
import { getColyseusPrimitivesJsonPointers } from '../src/traverse';

const DEFECTIBLE = { normal: 0, name: 'something' };
const design = new (class extends DesignState {})();
class DeeplyNested extends Schema {
    transient = '';

    @type('number')
    property = 0;
}
class Target extends Schema {
    transient = '';

    @type([DeeplyNested])
    array = new ArraySchema(new DeeplyNested());

    @type(['number'])
    numbers = new ArraySchema(1, 2, 3);

    @type('number')
    property = 0;
}

describe('traverse', () => {
    it('getColyseusPrimitivesJsonPointers() gets all pointers', () => {
        const target = new Target();
        const pointers = [...getColyseusPrimitivesJsonPointers(target)];
        expect(pointers).to.include.members([
            '/array/0/property',
            '/property',
            '/numbers/0',
            '/numbers/1',
            '/numbers/2',
        ]);
        expect(pointers).to.have.length(5);
    });
});
