import {
    Faction,
    Order,
    ShipManagerNpc,
    SpaceManager,
    Spaceship,
    Vec2,
    XY,
    makeShipState,
    shipConfigurations,
    toDegreesDelta,
} from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';

import { ChaingunDesign } from '../src/ship/chain-gun';
import { ShipDesign } from '../src/ship/make-ship-state';
import { demoShipChaingun } from '../src/configurations/demo-ship';
import { expect } from 'chai';

const demoShipConfig = shipConfigurations['demo-ship'];

// A turreted mount, unlike the roster's bolted-forward chain gun, can actually swing.
const turretedChaingun = { ...demoShipChaingun, turnSpeed: 90, bearingLimit: 180 };

/**
 * Issue #2181: a stationary, real-radius target inside gun range should let an attacking NPC settle
 * onto a heading and hold it. Both mount types must stay stable -- a bolted gun (no traverse, so the
 * hull alone carries the aim) and a turret (traverse absorbs most of the aim, but heading arbitration
 * still runs every tick).
 */
function runSustainedEngagement(mount: ChaingunDesign) {
    const design: ShipDesign = { ...demoShipConfig, chainGuns: [['FWD', mount]] };
    const spaceMgr = new SpaceManager();
    const attacker = new Spaceship().init('attacker', Vec2.make(XY.zero), 'demo-ship', Faction.Raiders);
    const die = new MockDie();
    die.expectedRoll = 1;
    const shipMgr = new ShipManagerNpc(attacker, makeShipState(attacker.id, design), spaceMgr, die);

    const target = new Spaceship().init('target', Vec2.make({ x: 0, y: 3000 }), 'demo-ship', Faction.Gravitas);

    spaceMgr.insert(attacker);
    spaceMgr.insert(target);
    spaceMgr.forceFlushEntities();

    shipMgr.state.order = Order.ATTACK;
    shipMgr.state.orderTargetId = target.id;

    const [chainGun] = shipMgr.state.chainGuns;
    let previousAngle = shipMgr.state.angle;
    let hullSweepAfter10s = 0;
    let firingTicksAfter10s = 0;
    let totalTicksAfter10s = 0;
    let maxTurnSpeedAfter10s = 0;

    for (const id of makeIterationsData(30, 600)) {
        shipMgr.update(id);
        spaceMgr.update(id);

        if (id.totalSeconds > 10) {
            hullSweepAfter10s += Math.abs(toDegreesDelta(shipMgr.state.angle - previousAngle));
            totalTicksAfter10s++;
            if (chainGun.isFiring) {
                firingTicksAfter10s++;
            }
            maxTurnSpeedAfter10s = Math.max(maxTurnSpeedAfter10s, Math.abs(shipMgr.state.turnSpeed));
        }
        previousAngle = shipMgr.state.angle;
    }

    return { hullSweepAfter10s, firingTicksAfter10s, totalTicksAfter10s, maxTurnSpeedAfter10s };
}

describe('NPC sustained engagement stability against a stationary target (issue #2181)', () => {
    afterEach(() => jest.restoreAllMocks());

    it('holds a stable heading with a bolted (non-turreted) mount', () => {
        const result = runSustainedEngagement({ ...demoShipChaingun });

        expect(result.hullSweepAfter10s).to.be.lessThan(90);
        expect(result.maxTurnSpeedAfter10s).to.be.lessThan(10);
        expect(result.firingTicksAfter10s / result.totalTicksAfter10s).to.be.greaterThan(0.5);
    });

    it('holds a stable heading with a turreted mount', () => {
        const result = runSustainedEngagement({ ...turretedChaingun });

        expect(result.hullSweepAfter10s).to.be.lessThan(90);
        expect(result.maxTurnSpeedAfter10s).to.be.lessThan(10);
    });
});
