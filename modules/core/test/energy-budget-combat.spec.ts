import { MockDie, makeIterationsData } from './ship-test-harness';
import { PowerLevel, ShipManagerPc, SmartPilotMode, SpaceManager, Spaceship, gravitas, makeShipState } from '../src';

import { expect } from 'chai';
import { switchToAvailableAmmo } from '../src/ship/chain-gun-manager';

/**
 * Regression test for #2187: testplay reported a single Corvette-vs-fighter fight needing roughly
 * five GM energy refills. Gravitas is the roster's corvette-class hull (#2042 size ladder: fighter 8
 * plates -> corvette 16), so it stands in for the reported "Corvette" here.
 */
describe('energy budget under sustained weapons fire (#2187)', () => {
    it('a fully-cooled gravitas at max reactor power does not drain its reserve firing its chaingun continuously for a full minute', () => {
        const spaceMgr = new SpaceManager();
        const shipObj = new Spaceship();
        shipObj.id = 'gravitas-1';
        shipObj.radius = gravitas.radius;
        const state = makeShipState(shipObj.id, gravitas);
        spaceMgr.insert(shipObj);
        const shipMgr = new ShipManagerPc(shipObj, state, spaceMgr, new MockDie());
        shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
        shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);

        state.reactor.power = PowerLevel.MAX;
        const chainGun = state.chainGuns[0];
        chainGun.power = PowerLevel.MAX;
        chainGun.coolantFactor = 1; // fully cooled: route all coolant to the gun under test, so heat can't be the limiter
        chainGun.isFiring = true;
        chainGun.loadAmmo = true;
        switchToAvailableAmmo(chainGun, state.magazine);

        const startEnergy = state.reactor.energy;
        for (const id of makeIterationsData(60, 60)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        expect(chainGun.heat, 'chaingun overheated despite being fully cooled').to.be.lessThan(100);
        expect(
            state.reactor.energy,
            'reactor drained from sustained gunfire at max power instead of staying roughly net-positive',
        ).to.be.at.least(startEnergy * 0.95);
    });
});
