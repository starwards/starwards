import {
    Faction,
    Order,
    ShipManagerNpc,
    SpaceManager,
    Spaceship,
    XY,
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

describe('AI pilot combat: evasive weave (issue #2146)', () => {
    afterEach(() => jest.restoreAllMocks());

    it('weaves laterally while holding an attack position, without losing the target off its firing arc', () => {
        const design: ShipDesign = {
            ...demoShipConfig,
            chainGuns: [['FWD', turretedChaingun]],
        };
        const spaceMgr = new SpaceManager();
        const shipObj = new Spaceship();
        shipObj.id = 'attacker';
        shipObj.faction = Faction.Raiders;
        const targetObj = new Spaceship();
        targetObj.id = 'target';
        targetObj.faction = Faction.Gravitas;
        // within the mount's [minShellRange, maxShellRange] band, so the AI holds station here
        // (matchGlobalSpeed) instead of closing distance (moveToTarget) -- a stationary target and
        // a stationary attacker would otherwise command zero strafe every single tick.
        targetObj.position.x = 3000;
        targetObj.position.y = 0;
        const die = new MockDie();
        die.expectedRoll = 1;
        const shipMgr = new ShipManagerNpc(shipObj, makeShipState(shipObj.id, design), spaceMgr, die);
        spaceMgr.insert(shipObj);
        spaceMgr.insert(targetObj);
        spaceMgr.forceFlushEntities();

        shipMgr.state.order = Order.ATTACK;
        shipMgr.state.orderTargetId = targetObj.id;

        const mount = shipMgr.state.chainGuns[0];
        const strafeSamples: number[] = [];
        const aimErrorSamples: number[] = [];
        // A short, early window only: a stationary attacker holding on a stationary in-range target
        // commands exactly zero strafe every tick under plain station-keeping (matchGlobalSpeed) --
        // confirmed empirically for this scenario's first ~4.5 sim-seconds, well short of the
        // pass-by dynamics that eventually kick in further into a real engagement.
        for (const id of makeIterationsData(4.5, 90)) {
            shipMgr.update(id);
            spaceMgr.update(id);
            strafeSamples.push(shipMgr.state.smartPilot.maneuvering.y);
            const lineOfSightBearing = XY.angleOf(XY.difference(targetObj.position, shipObj.position));
            aimErrorSamples.push(Math.abs(toDegreesDelta(mount.getGlobalBearing(shipMgr.state) - lineOfSightBearing)));
        }

        // some samples must differ meaningfully from that zero baseline for a weave to exist at all.
        expect(Math.max(...strafeSamples.map(Math.abs))).to.be.greaterThan(0.05);
        // ...and the weave must stay "minimal": the mount keeps tracking the target, not swinging wild.
        expect(Math.max(...aimErrorSamples)).to.be.lessThan(15);
    });
});
