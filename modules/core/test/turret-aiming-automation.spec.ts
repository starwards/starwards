import {
    Faction,
    Order,
    ShipManagerNpc,
    SpaceManager,
    Spaceship,
    ammoTypes,
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
const turretedChaingun = { ...demoShipChaingun, turnSpeed: 90, bearingLimit: 180 };

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

describe('an NPC turreted mount with skew damage under attack orders (#2176)', () => {
    afterEach(() => jest.restoreAllMocks());

    it('is knocked off-target the instant a skew defect lands, and swings back on-target over several seconds as the AI compensates', () => {
        const design: ShipDesign = {
            ...demoShipConfig,
            chainGuns: [['FWD', { ...turretedChaingun, maxBearingSkew: 45 }]],
        };
        const spaceMgr = new SpaceManager();
        const shipObj = new Spaceship();
        shipObj.id = 'attacker';
        shipObj.faction = Faction.Raiders;
        const targetObj = new Spaceship();
        targetObj.id = 'target';
        targetObj.faction = Faction.Gravitas;
        targetObj.position.x = 0;
        targetObj.position.y = 3000;
        const die = new MockDie();
        die.expectedRoll = 1;
        const shipMgr = new ShipManagerNpc(shipObj, makeShipState(shipObj.id, design), spaceMgr, die);
        spaceMgr.insert(shipObj);
        spaceMgr.insert(targetObj);
        spaceMgr.forceFlushEntities();

        const [mount] = shipMgr.state.chainGuns;
        // an empty magazine keeps the target still — this test is about aim, not damage or recoil
        for (const ammoType of ammoTypes) {
            shipMgr.state.magazine.setCount(ammoType, 0);
        }
        shipMgr.state.order = Order.ATTACK;
        shipMgr.state.orderTargetId = targetObj.id;

        // let the mount settle onto the target before any damage lands
        for (const id of makeIterationsData(6, 120)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }
        expect(Math.abs(toDegreesDelta(mount.hullBearing))).to.be.lessThan(2);

        // sudden defect bends the mount off its commanded bearing — well short of `broken` (45)
        mount.bearingSkew = 20;
        for (const id of makeIterationsData(0.05, 1)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }
        // one tick in: the AI's lagged estimate has barely moved, so the mount is still bent by
        // close to the full defect — a mount defect has an immediate tactical consequence
        expect(Math.abs(toDegreesDelta(mount.hullBearing))).to.be.greaterThan(15);

        // several more seconds of continued engagement: the AI's tracked estimate catches up and
        // the mount swings back close to the target
        for (const id of makeIterationsData(12, 240)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }
        expect(Math.abs(toDegreesDelta(mount.hullBearing))).to.be.lessThan(5);
    });
});
