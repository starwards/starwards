import {
    Faction,
    Order,
    ShipManagerNpc,
    SpaceManager,
    Spaceship,
    makeShipState,
    shipConfigurations,
    toDegreesDelta,
} from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';

import { ShipDesign } from '../src/ship/make-ship-state';
import { demoShipChaingun } from '../src/configurations/demo-ship';
import { expect } from 'chai';

const demoShipConfig = shipConfigurations['demo-ship'];

// A turreted mount, unlike the roster's bolted-forward chain gun, can actually swing.
const turretedChaingun = { ...demoShipChaingun, turnSpeed: 90 };

describe('an NPC ship with multiple turreted mounts under attack orders', () => {
    afterEach(() => jest.restoreAllMocks());

    it('swings every mount onto the target instead of leaving them fixed forward and aft', () => {
        const design: ShipDesign = {
            ...demoShipConfig,
            chainGuns: [
                ['FWD', turretedChaingun],
                ['AFT', turretedChaingun],
            ],
        };
        const spaceMgr = new SpaceManager();
        const shipObj = new Spaceship();
        shipObj.id = 'attacker';
        shipObj.faction = Faction.Raiders;
        const targetObj = new Spaceship();
        targetObj.id = 'target';
        targetObj.faction = Faction.Gravitas;
        targetObj.position.x = 0;
        targetObj.position.y = 5000;
        const die = new MockDie();
        die.expectedRoll = 1;
        const shipMgr = new ShipManagerNpc(shipObj, makeShipState(shipObj.id, design), spaceMgr, die);
        spaceMgr.insert(shipObj);
        spaceMgr.insert(targetObj);
        spaceMgr.forceFlushEntities();

        const [fwdMount, aftMount] = shipMgr.state.chainGuns;
        expect(fwdMount.hullBearing).to.equal(0);
        expect(aftMount.hullBearing).to.equal(180);

        shipMgr.state.order = Order.ATTACK;
        shipMgr.state.orderTargetId = targetObj.id;

        for (const id of makeIterationsData(5, 20)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        // both mounts converge on the same bearing toward the target (normalized: hullBearing is a
        // plain sum of fittedBearing + bearingSkew + bearing, not itself wrapped to [-180, 180])...
        expect(toDegreesDelta(fwdMount.hullBearing)).to.be.closeTo(toDegreesDelta(aftMount.hullBearing), 2);
        // ...which means the aft mount actually swung off the bearing it was fitted at
        expect(toDegreesDelta(aftMount.hullBearing)).to.not.be.closeTo(180, 2);
    });
});
