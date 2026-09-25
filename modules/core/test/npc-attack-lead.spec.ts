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
    solveShellIntercept,
    toDegreesDelta,
} from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';

import { expect } from 'chai';

const HZ = 60;
const SIM_SECONDS = 60;
const SETTLE_SECONDS = 20;

/**
 * An NPC on an ATTACK order holding station on a target that crosses its line of sight at a
 * constant `crossingSpeed`. A bolted mount can only be aimed by the hull, so the hull must point at
 * the shell intercept point -- where the target will be when the round arrives -- not at where the
 * target is now. Returns the median, over settled in-range ticks, of the hull's error to the
 * intercept bearing.
 */
function medianInterceptHeadingError(crossingSpeed: number) {
    const spaceMgr = new SpaceManager();
    const die = new MockDie();
    die.expectedRoll = 1;
    const attacker = new Spaceship().init('attacker', Vec2.make(XY.zero), 'gravitas', Faction.Gravitas);
    const attackerMgr = new ShipManagerNpc(
        attacker,
        makeShipState(attacker.id, shipConfigurations.gravitas),
        spaceMgr,
        die,
    );
    const target = new Spaceship().init('target', Vec2.make({ x: 3000, y: 0 }), 'dragonfly-MK1', Faction.Raiders);
    const crossing = { x: 0, y: crossingSpeed };
    spaceMgr.insert(attacker);
    spaceMgr.insert(target);
    spaceMgr.forceFlushEntities();
    attackerMgr.state.order = Order.ATTACK;
    attackerMgr.state.orderTargetId = target.id;

    const [gun] = attackerMgr.state.chainGuns;
    const errors: number[] = [];
    for (const id of makeIterationsData(SIM_SECONDS, SIM_SECONDS * HZ)) {
        // A constant crossing: blast knock-back is not what this measures.
        target.velocity.x = crossing.x;
        target.velocity.y = crossing.y;
        attackerMgr.update(id);
        spaceMgr.update(id);
        const distance = XY.distance(target.position, attacker.position);
        if (id.totalSeconds > SETTLE_SECONDS && distance <= gun.design.maxShellRange) {
            const { aimPoint } = solveShellIntercept(attackerMgr.state, gun, target);
            const interceptBearing = XY.angleOf(XY.difference(aimPoint, attacker.position));
            errors.push(Math.abs(toDegreesDelta(attacker.angle - interceptBearing)));
        }
    }
    errors.sort((a, b) => a - b);
    return { median: errors[Math.floor(errors.length / 2)], samples: errors.length };
}

describe('NPC attack heading leads a crossing target', () => {
    jest.setTimeout(60_000);

    it('points the hull at the shell intercept point, not at the target, when the target crosses at 200 m/s', () => {
        const { median, samples } = medianInterceptHeadingError(200);

        expect(samples).to.be.greaterThan(HZ * 10);
        // The intercept lead at 200 m/s and ~2,000 m/s shells is ~6 degrees; aiming at the target
        // itself leaves roughly that as a standing error.
        expect(median).to.be.lessThan(1.5);
    });
});
