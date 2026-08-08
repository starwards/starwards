import { DamageManager, SpaceManager, Spaceship, demoShip, makeShipState } from '../src';

import { MockDie } from './ship-test-harness';
import { expect } from 'chai';

describe('tubes receive defects through the ordinary damage path (issue #2110)', () => {
    it('A1: a hit on a Tube mutates a ChainGun-family defectible field (bearingSkew)', () => {
        const state = makeShipState('test-ship', demoShip);
        const tube = state.tubes[0];
        tube.design.damage50 = 0; // guaranteed single defect per hit, sidesteps the spillover roll
        const die = new MockDie();
        die.expectedRoll = 0; // damageChainGun's 0.5 coin flip -> true -> bearingSkew branch
        const damageManager = new DamageManager(new Spaceship(), state, new SpaceManager(), die);

        damageManager.damageSystem(tube, { id: 'hit', amount: 1 }, 1);

        expect(tube.bearingSkew).to.not.equal(0);
    });

    it('A4: chain-gun defect behaviour is byte-identical to master — same dispatch, same fields', () => {
        const state = makeShipState('test-ship', demoShip);
        const chainGun = state.chainGuns[0];
        chainGun.design.damage50 = 0;
        const die = new MockDie();
        die.expectedRoll = 0.6; // damageChainGun's 0.5 coin flip -> false -> rateOfFireFactor branch
        const damageManager = new DamageManager(new Spaceship(), state, new SpaceManager(), die);

        damageManager.damageSystem(chainGun, { id: 'hit', amount: 1 }, 1);

        expect(chainGun.rateOfFireFactor).to.be.closeTo(0.9, 0.0001);
        expect(chainGun.bearingSkew).to.equal(0);
    });
});
