import { ArraySchema, Schema } from '@colyseus/schema';
import { defectible, getDefectibles } from '../src/defectible';

import { expect } from 'chai';

const DEFECTIBLE = { normal: 0, name: 'general malfunction' };
class DeeplyNested extends Schema {
    name = '';

    @defectible(DEFECTIBLE)
    property = 0;
}
class Target extends Schema {
    name = '';
    array = new ArraySchema<DeeplyNested>(new DeeplyNested());

    @defectible(DEFECTIBLE)
    property = 0;

    /**
     * here to keep in mind that getters are NOT detected
     */
    @defectible(DEFECTIBLE)
    get propertyGetter() {
        return 3;
    }
}

describe('defectible', () => {
    it('getDefectibles() gets all defectible properties', () => {
        const target = new Target();
        target.property = 1;
        target.array.at(0).property = 2;
        const m = getDefectibles(target);
        expect(m).to.have.length(2);
        expect(m).to.include.deep.members([
            { ...DEFECTIBLE, systemPointer: '', field: 'property', value: 1 },
            { ...DEFECTIBLE, systemPointer: '/array/0', field: 'property', value: 2 },
        ]);
    });
});
