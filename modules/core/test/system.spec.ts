import { ArraySchema, Schema, type } from '@colyseus/schema';
import { DesignState, defectible, getSystems } from '../src/ship/system';

import { expect } from 'chai';

const DEFECTIBLE = { normal: 0, name: 'something' };
const design = new (class extends DesignState {})();
class DeeplyNested extends Schema {
    name = '';
    design = design;
    broken = false;

    @defectible(DEFECTIBLE)
    @type('number')
    property = 0;
}
class Target extends Schema {
    name = '';
    design = design;
    broken = false;

    @type([DeeplyNested])
    array = new ArraySchema<DeeplyNested>(new DeeplyNested());

    @defectible(DEFECTIBLE)
    @type('number')
    property = 0;

    /**
     * here to keep in mind that getters are NOT detected
     */
    @defectible(DEFECTIBLE)
    @type('number')
    get propertyGetter() {
        return 3;
    }
}

describe('defectible', () => {
    it('getSystems() gets all defectible properties', () => {
        const target = new Target();
        target.property = 1;
        target.array.at(0).property = 2;
        const m = getSystems(target).flatMap((s) => s.defectibles);
        expect(m).to.include.deep.members([
            { ...DEFECTIBLE, systemPointer: '', field: 'property', value: 1 },
            { ...DEFECTIBLE, systemPointer: '/array/0', field: 'property', value: 2 },
        ]);
        expect(m).to.have.length(2);
    });
});
