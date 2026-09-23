import { SpaceManager, Spaceship, makeShipState, shipConfigurations } from '../src';

import { DamageManager } from '../src/ship/damage-manager';
import { MockDie } from './ship-test-harness';
import { expect } from 'chai';

describe('damageReactor', () => {
    it('floors effeciencyFactor at 0 (its declared range), so a repair counts up from broken, not below it', () => {
        const state = makeShipState('1', shipConfigurations.gravitas);
        const reactor = state.reactor;
        reactor.design.damage50 = 0; // guaranteed single defect per hit, sidesteps the outer spillover roll
        const damageManager = new DamageManager(new Spaceship(), state, new SpaceManager(), new MockDie());

        for (let hit = 0; hit < 12; hit++) {
            damageManager.damageSystem(reactor, { id: `hit${hit}`, amount: 1 }, 1);
        }

        expect(reactor.broken).to.equal(true);
        expect(reactor.effeciencyFactor).to.equal(0);
    });
});
