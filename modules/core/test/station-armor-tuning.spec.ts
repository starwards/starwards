import { makeShipState, shipConfigurations } from '../src';

import { expect } from 'chai';

function totalArmorHealth(state: ReturnType<typeof makeShipState>) {
    let sum = 0;
    for (const plate of state.armor.armorPlates) {
        for (const layer of plate.layers) {
            sum += layer.health;
        }
    }
    return sum;
}

describe('station armour totals (issue #2103)', () => {
    it('large station: 36 plates totalling 1500 armour', () => {
        const state = makeShipState('s', shipConfigurations['large-station']);
        expect(state.armor.numberOfPlates).to.equal(36);
        expect(totalArmorHealth(state)).to.be.closeTo(1500, 1);
    });

    it('chaingun platform: 36 plates totalling 1350 armour', () => {
        const state = makeShipState('s', shipConfigurations['chaingun-platform']);
        expect(state.armor.numberOfPlates).to.equal(36);
        expect(totalArmorHealth(state)).to.be.closeTo(1350, 1);
    });

    it('small station: 36 plates totalling 750 armour -- half the large station, per the size ladder', () => {
        const state = makeShipState('s', shipConfigurations['small-station']);
        expect(state.armor.numberOfPlates).to.equal(36);
        expect(totalArmorHealth(state)).to.be.closeTo(750, 1);
        const largeState = makeShipState('l', shipConfigurations['large-station']);
        expect(totalArmorHealth(state)).to.be.closeTo(totalArmorHealth(largeState) / 2, 1);
    });

    it('leaves non-station hull armour (and everything else about those hulls) untouched', () => {
        expect(shipConfigurations['dragonfly-MK1'].armor).to.deep.equal({
            numberOfPlates: 8,
            layers: [{ type: 'composite', plateMaxHealth: 50 }],
        });
        expect(shipConfigurations['gravitas'].armor).to.deep.equal({
            numberOfPlates: 16,
            layers: [
                { type: 'whipple', plateMaxHealth: 50 },
                { type: 'composite', plateMaxHealth: 150 },
            ],
        });
    });
});
