import { SpaceManager, Spaceship, makeShipState, shipConfigurations } from '../src';

import { DamageManager } from '../src/ship/damage-manager';
import { MockDie } from './ship-test-harness';
import { expect } from 'chai';

describe('damageRadar gates each surface on the design actually declaring it', () => {
    it('never writes bearingSkew on a radar whose design declares no skew surface (maxBearingSkew: 0)', () => {
        const state = makeShipState('1', shipConfigurations['demo-ship']);
        const radar = state.radars[1]; // scan-beam: turnSpeed > 0, maxBearingSkew unset (0 default)
        expect(radar.design.turnSpeed).to.be.greaterThan(0);
        expect(radar.design.maxBearingSkew).to.equal(0);
        radar.design.damage50 = 0; // guaranteed single defect per hit, sidesteps the outer spillover roll

        const die = new MockDie();
        // fails the 0.5 "range" coin flip, and would have landed on the (buggy) bearingSkew branch
        // under the old 3-way [0,3) roll — the fixed 2-way [0,2) roll must land elsewhere instead.
        die.expectedRoll = 1.5;
        const damageManager = new DamageManager(new Spaceship(), state, new SpaceManager(), die);

        damageManager.damageSystem(radar, { id: 'hit', amount: 1 }, 1);

        expect(radar.bearingSkew).to.equal(0);
        expect(radar.bearingLimitFactor).to.be.lessThan(1);
    });

    it('rolls across bearingSkew too once the design declares a skew surface', () => {
        const state = makeShipState('1', shipConfigurations['demo-ship']);
        const radar = state.radars[1];
        radar.design.damage50 = 0;
        radar.design.maxBearingSkew = 45; // design now declares a skew surface

        const die = new MockDie();
        die.expectedRoll = 1.5; // second of three [0,3) surfaces: turnSpeedFactor, bearingSkew, bearingLimitFactor
        const damageManager = new DamageManager(new Spaceship(), state, new SpaceManager(), die);

        damageManager.damageSystem(radar, { id: 'hit', amount: 1 }, 1);

        expect(radar.bearingSkew).to.not.equal(0);
    });
});
