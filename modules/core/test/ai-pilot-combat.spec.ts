import {
    Faction,
    Order,
    ShipDie,
    ShipManagerNpc,
    SpaceManager,
    Spaceship,
    Vec2,
    XY,
    makeShipState,
    shipConfigurations,
} from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';

import { expect } from 'chai';

describe('AI pilot combat: evasive weave (issue #2146)', () => {
    afterEach(() => jest.restoreAllMocks());

    it('produces real, oscillating cross-track displacement once pinned at max speed during a long approach', () => {
        // Mirrors the wave-defence scenario's actual regime (spawn ~140km out, ATTACK ordered
        // immediately): the ship saturates maxSpeed within ~2s and spends the rest of a long
        // closing approach pinned there in the out-of-range branch (moveToTarget), full boost.
        // That is exactly where a governor bug previously erased the weave outright -- see
        // ship-manager.ts's `capMaxSpeed` (formerly a wholesale `smartPilot.maneuvering` overwrite).
        const spaceMgr = new SpaceManager();
        const die = new MockDie();
        die.expectedRoll = 1;

        const attacker = new Spaceship().init('attacker', Vec2.make(XY.zero), 'dragonfly-MK1', Faction.Raiders);
        const attackerState = makeShipState(attacker.id, shipConfigurations['dragonfly-MK1']);
        attackerState.isPlayerShip = false;
        const attackerMgr = new ShipManagerNpc(attacker, attackerState, spaceMgr, die);

        const target = new Spaceship();
        target.id = 'target';
        target.faction = Faction.Gravitas;
        // due "east" of the attacker and well beyond maxShellRange (4500m), so the whole run stays
        // in the closing/moveToTarget branch -- never reaches the in-range holding band.
        target.position.x = 30_000;
        target.position.y = 0;

        spaceMgr.insert(attacker);
        spaceMgr.insert(target);
        spaceMgr.forceFlushEntities();

        attackerMgr.state.order = Order.ATTACK;
        attackerMgr.state.orderTargetId = target.id;

        // The attacker starts at the origin heading due east, so the line-of-sight to the target is
        // the x-axis and cross-track displacement is simply the y-coordinate.
        const crossTrackSamples: number[] = [];
        for (const id of makeIterationsData(20, 400)) {
            attackerMgr.update(id);
            spaceMgr.update(id);
            crossTrackSamples.push(attacker.position.y);
        }

        // real, substantial sideways motion in both directions (measured: roughly -90m to +825m
        // over this 20s window) -- not just a written command value that never reaches the physics
        // (the bug this regresses against, where the max-speed governor silently discarded it).
        expect(Math.max(...crossTrackSamples)).to.be.greaterThan(200);
        expect(Math.min(...crossTrackSamples)).to.be.lessThan(-20);
    });

    it('keeps a stable per-ship phase across the 3-second event-salt window (regression: an event roll re-rolls every 3s)', () => {
        // The weave's phase must be a per-ship constant for the ship's lifetime. `ShipDie.getRoll`
        // is an *event* roll -- its salt rotates every `EVENT_SALT_WINDOW_SECONDS` (3s) -- so using
        // it as a phase would silently re-roll mid-engagement. `getDrift` sampled at frequency 0
        // evaluates `noise(seed, gameTime * 0)`, a fixed point on the seed's own channel: constant
        // regardless of how much game time (or how many salt rotations) have passed.
        const die = new ShipDie(12345);
        const rollBefore = die.getRoll('some-event-roll-id');
        const driftBefore = die.getDrift('some-drift-id', 0);

        for (const id of makeIterationsData(8, 160)) {
            die.update(id); // 8 sim-seconds, spans the 3-second salt window at least twice
        }

        const rollAfter = die.getRoll('some-event-roll-id');
        const driftAfter = die.getDrift('some-drift-id', 0);

        // the event roll is expected to have moved on (proves the salt window actually advanced)
        expect(rollAfter).to.not.equal(rollBefore);
        // the frequency-0 drift sample -- what `combatWeave` now uses for its phase -- does not
        expect(driftAfter).to.equal(driftBefore);
    });
});
