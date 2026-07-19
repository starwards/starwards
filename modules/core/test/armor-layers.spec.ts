import { makeShipState, resetShipState, shipConfigurations } from '../src';

import { expect } from 'chai';

const dragonflyConfig = shipConfigurations['dragonfly-SF22'];

const layeredArmor = {
    numberOfPlates: 12,
    layers: [
        { type: 'reactive' as const, plateMaxHealth: 100 },
        { type: 'composite' as const, plateMaxHealth: 1000 },
    ],
};

function makeLayeredState(id = 'test-ship') {
    return makeShipState(id, { ...dragonflyConfig, armor: layeredArmor });
}

describe('armor layer stacks', () => {
    it('makeArmor rejects a non-composite innermost layer', () => {
        expect(() =>
            makeShipState('test-ship', {
                ...dragonflyConfig,
                armor: { numberOfPlates: 12, layers: [{ type: 'reactive', plateMaxHealth: 100 }] },
            }),
        ).to.throw();
    });

    it('builds one layer design and one plate layer per config layer, outermost first', () => {
        const state = makeLayeredState();
        expect(state.armor.layerDesigns.length).to.equal(2);
        expect(state.armor.layerDesigns[0].singleUsePlates).to.equal(true);
        expect(state.armor.layerDesigns[1].singleUsePlates).to.equal(false);
        for (const plate of state.armor.armorPlates) {
            expect(plate.layers.length).to.equal(2);
            expect(plate.layers[0].maxHealth).to.equal(100);
            expect(plate.layers[1].maxHealth).to.equal(1000);
        }
    });

    it('plate healthRatio aggregates health over all layers', () => {
        const state = makeLayeredState();
        const plate = state.armor.armorPlates[0];
        expect(plate.healthRatio).to.equal(1);
        plate.layers[0].health = 0;
        plate.layers[1].health = 550;
        expect(plate.healthRatio).to.be.closeTo(0.5, 0.0001);
    });

    it('a plate counts as healthy while any layer is intact', () => {
        const state = makeLayeredState();
        const plate = state.armor.armorPlates[0];
        plate.layers[0].health = 0;
        expect(state.armor.numberOfHealthyPlates).to.equal(state.armor.numberOfPlates);
        plate.layers[1].health = 0;
        expect(state.armor.numberOfHealthyPlates).to.equal(state.armor.numberOfPlates - 1);
    });

    it('fixArmor restores every layer, including single-use cells', () => {
        const state = makeLayeredState();
        const plate = state.armor.armorPlates[0];
        plate.layers[0].health = 0;
        plate.layers[1].health = 0;
        resetShipState(state);
        expect(plate.layers[0].health).to.equal(100);
        expect(plate.layers[1].health).to.equal(1000);
    });
});
