import { DesignState, SystemState, defectible, getSystems } from '../src/ship/system';

import { ArraySchema } from '@colyseus/schema';
import { expect } from 'chai';
import { gameField } from '../src/game-field';

const DEFECTIBLE = { normal: 0, name: 'something' };
const design = new (class extends DesignState {})();
class DeeplyNested extends SystemState {
    name = '';
    design = design;
    broken = false;
    energyPerMinute = 0;

    @defectible(DEFECTIBLE)
    @gameField('number')
    property = 0;
}
class Target extends SystemState {
    name = '';
    design = design;
    broken = false;
    energyPerMinute = 0;

    @gameField([DeeplyNested])
    array = new ArraySchema<DeeplyNested>(new DeeplyNested());

    @defectible(DEFECTIBLE)
    @gameField('number')
    property = 0;

    /**
     * here to keep in mind that getters are NOT detected
     */
    @defectible(DEFECTIBLE)
    @gameField('number')
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
