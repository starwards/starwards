import { Faction, IdleStrategy, ShipManagerNpc, Spaceship, XY } from '../src';
import { createShipSetup, narrowArcPlatformConfig, runOneTick } from './automation-order-fixtures';

import { expect } from 'chai';

describe('default-fire gunnery, gated by idleStrategy (issue #2145)', () => {
    function createHostile(id: string, faction: Faction, position: XY) {
        const hostile = new Spaceship();
        hostile.id = id;
        hostile.faction = faction;
        hostile.position.setValue(position);
        return hostile;
    }

    it('opens blind on a skewed mount, then dials the skew out of its aim as it observes the error', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, narrowArcPlatformConfig(30));
        shipObj.faction = Faction.Raiders;
        shipMgr.state.idleStrategy = IdleStrategy.STAND_GROUND;
        const gun = shipMgr.state.chainGuns[0];
        expect(gun).to.not.equal(undefined);
        // Damage has skewed the mount 15 degrees off where it was fitted, still inside the design's
        // 45-degree maxBearingSkew so the mount isn't `broken`; its traverse narrows to ±20, still
        // enough to bring the firing line back onto a dead-ahead target (M4.33).
        gun.bearingSkew = 15;

        const hostile = createHostile('hostile', Faction.Gravitas, XY.byLengthAndDirection(5000, 0));
        // this test is about the mount's aim converging on a stationary hostile over 600 ticks of
        // sustained fire, not the hostile's physics — frozen so blast impulse (issue #2252) can't
        // push it off its scripted position once shots start actually registering
        hostile.freeze = true;
        spaceMgr.insert(hostile);
        spaceMgr.forceFlushEntities();

        runOneTick(shipMgr, spaceMgr);

        // The automation never reads `bearingSkew` (#2176/#2177) — its belief comes only from
        // observing where its commands actually landed. One tick in, the exponential filter has
        // taken a single step toward the defect, nowhere near compensating it, so the mount is
        // still bent most of the way off target: a fresh defect has an immediate tactical cost.
        expect(Math.abs(gun.bearingCommand)).to.be.lessThan(10);

        // Given seconds of continued engagement the tracked estimate converges on the real defect
        // and the firing line comes back onto the target, at which point the mount opens up.
        // Judged across the run, not on the last tick: with sustained fire no longer heat-throttled
        // (#2313) the mount can empty its magazine well before the loop ends.
        let firedOnTarget = false;
        for (let i = 0; i < 600; i++) {
            runOneTick(shipMgr, spaceMgr);
            firedOnTarget ||= gun.isFiring && Math.abs(gun.hullBearing) < 1;
        }
        expect(gun.hullBearing).to.be.closeTo(0, 1);
        expect(firedOnTarget, 'mount opened fire once its firing line was back on target').to.equal(true);
    });
});
