import { makeShipState, shipConfigurations } from '../src';

import { expect } from 'chai';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe("gameField('float32')", () => {
    it('stores server-side assignments as unrounded doubles', () => {
        const state = makeShipState('p', shipConfigurations['dragonfly-MK1']);
        let x = 0;
        for (let i = 0; i < 60; i++) {
            x += 0.01;
        }
        state.smartPilot.offsetFactor = x;
        expect(state.smartPilot.offsetFactor).to.equal(x);
        expect(state.smartPilot.offsetFactor).not.to.equal(0.6);
    });

    it('has no setter-rounding wrapper in game-field.ts', () => {
        const source = readFileSync(resolve(__dirname, '../src/game-field.ts'), 'utf8');
        expect(source).not.to.match(/number2Digits|Math\.round|_definition/);
    });
});
