import { ArraySchema, Schema } from '@colyseus/schema';

import { expect } from 'chai';
import { gameField } from '../src/game-field';
import { getColyseusPrimitivesJsonPointers } from '../src/traverse';

class DeeplyNested extends Schema {
    transient = '';

    @gameField('number')
    property = 0;
}
class Target extends Schema {
    transient = '';

    @gameField([DeeplyNested])
    array = new ArraySchema(new DeeplyNested());

    @gameField(['number'])
    numbers = new ArraySchema(1, 2, 3);

    @gameField('number')
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
