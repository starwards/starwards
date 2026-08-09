import { DesignState, PowerLevel, SystemState, defectible, getSystems } from '../src/ship/system';

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

describe('SystemState', () => {
    it('defaults power to NORMAL, not MAX', () => {
        const target = new Target();
        expect(target.power).to.equal(PowerLevel.NORMAL);
    });

    it('isInternal reads from the design state', () => {
        const target = new Target();
        target.design = new (class extends DesignState {})();
        expect(target.isInternal).to.equal(false);
        target.design.isInternal = true;
        expect(target.isInternal).to.equal(true);
    });

    it('isElectronics reads from the design state', () => {
        const target = new Target();
        target.design = new (class extends DesignState {})();
        expect(target.isElectronics).to.equal(false);
        target.design.isElectronics = true;
        expect(target.isElectronics).to.equal(true);
    });
});

describe('System.getStatus', () => {
    it('reports STARVED, not OK, when the system could not draw the energy it needed', () => {
        const target = new Target();
        target.energyStarved = true;
        const [system] = getSystems(target);
        expect(system.getStatus()).to.equal('STARVED');
    });

    it('broken still wins over energyStarved', () => {
        const target = new Target();
        target.broken = true;
        target.energyStarved = true;
        const [system] = getSystems(target);
        expect(system.getStatus()).to.equal('DISABLED');
    });

    it('reports DAMAGED_STARVED, not just STARVED, when the system is both damaged and starved — starving must not hide a real defect', () => {
        const target = new Target();
        target.property = 1; // off its DEFECTIBLE normal (0) — damaged
        target.energyStarved = true;
        const [system] = getSystems(target);
        expect(system.getStatus()).to.equal('DAMAGED_STARVED');
    });
});

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
