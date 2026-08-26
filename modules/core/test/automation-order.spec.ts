import {
    ChaingunDesign,
    DockingMode,
    Faction,
    FlightDoctrine,
    IdleStrategy,
    Order,
    PowerLevel,
    ShipDesign,
    ShipDirectionConfig,
    ShipManagerNpc,
    ShipManagerPc,
    SmartPilotMode,
    SpaceManager,
    Spaceship,
    ThrusterDesign,
    Vec2,
    XY,
    chaingunPlatformChaingun,
    demoShipThruster,
    makeShipState,
    shellAmmoTypes,
    shipConfigurations,
    toDegreesDelta,
} from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';

import { expect } from 'chai';
import { resetShipState } from '../src/ship/ship-manager-abstract';

const demoShipConfig = shipConfigurations['demo-ship'];

function createShipSetup(Ctor: typeof ShipManagerPc | typeof ShipManagerNpc, config: ShipDesign = demoShipConfig) {
    const spaceMgr = new SpaceManager();
    const shipObj = new Spaceship();
    shipObj.id = '1';
    const die = new MockDie();
    const shipMgr = new Ctor(shipObj, makeShipState(shipObj.id, config), spaceMgr, die);
    die.expectedRoll = 1;
    spaceMgr.insert(shipObj);
    shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
    shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
    return { spaceMgr, shipObj, shipMgr, die };
}

function narrowArcPlatformConfig(bearingLimit: number) {
    const chainGuns: [ShipDirectionConfig, ChaingunDesign][] = [['FWD', { ...chaingunPlatformChaingun, bearingLimit }]];
    // Also zeroes rotationCapacity so an ATTACK order's own pursuit/hull-facing behavior (which
    // rotates the hull toward the ordered target regardless of any mount's bearing limit — a
    // movement concern, unrelated to gunnery) can't confound a bearingCommand assertion that's
    // meant to isolate the mount's own aiming decision.
    const maneuvering = { ...shipConfigurations['chaingun-platform'].maneuvering, rotationCapacity: 0 };
    return { ...shipConfigurations['chaingun-platform'], chainGuns, maneuvering };
}

/**
 * A single narrow-arc FWD mount on a hull that *can* rotate — the give-way behavior itself, rather
 * than the mount's own aiming decision, is what these scenarios assert.
 */
function rotatingNarrowArcPlatformConfig(bearingLimit: number) {
    const chainGuns: [ShipDirectionConfig, ChaingunDesign][] = [['FWD', { ...chaingunPlatformChaingun, bearingLimit }]];
    return { ...shipConfigurations['chaingun-platform'], chainGuns };
}

/** Three narrow-arc mounts covering distinct, non-overlapping sectors (FWD/STBD/AFT). */
function threeMountNarrowArcConfig(bearingLimit: number) {
    const chainGuns: [ShipDirectionConfig, ChaingunDesign][] = [
        ['FWD', { ...chaingunPlatformChaingun, bearingLimit }],
        ['STBD', { ...chaingunPlatformChaingun, bearingLimit }],
        ['AFT', { ...chaingunPlatformChaingun, bearingLimit }],
    ];
    const maneuvering = { ...shipConfigurations['chaingun-platform'].maneuvering, rotationCapacity: 0 };
    return { ...shipConfigurations['chaingun-platform'], chainGuns, maneuvering };
}

/**
 * Three full-traverse mounts (bearingLimit 180, like chaingun-platform's real FWD gun), all
 * fitted FWD so all three start already aligned with a dead-ahead target -- turnSpeed-limited
 * swing convergence is a physical/movement concern unrelated to what these tests assert about
 * gunnery's own per-mount firing decision.
 */
function threeMountFullTraverseConfig() {
    const chainGuns: [ShipDirectionConfig, ChaingunDesign][] = [
        ['FWD', chaingunPlatformChaingun],
        ['FWD', chaingunPlatformChaingun],
        ['FWD', chaingunPlatformChaingun],
    ];
    const maneuvering = { ...shipConfigurations['chaingun-platform'].maneuvering, rotationCapacity: 0 };
    return { ...shipConfigurations['chaingun-platform'], chainGuns, maneuvering };
}

/**
 * Two full-traverse mounts fitted FWD with very different `maxShellRange`: mount 0 is short-range,
 * mount 1 reaches far beyond it. Used to prove ATTACK re-acquisition considers the ship's best
 * mount, not just `chainGuns[0]`.
 */
function shortAndLongRangeConfig() {
    const chainGuns: [ShipDirectionConfig, ChaingunDesign][] = [
        ['FWD', { ...chaingunPlatformChaingun, maxShellRange: 4_000 }],
        ['FWD', { ...chaingunPlatformChaingun, maxShellRange: 20_000 }],
    ];
    const maneuvering = { ...shipConfigurations['chaingun-platform'].maneuvering, rotationCapacity: 0 };
    return { ...shipConfigurations['chaingun-platform'], chainGuns, maneuvering };
}

/**
 * Same short/long-range mount pair as {@link shortAndLongRangeConfig}, but on a hull with real
 * thrusters (`demo-ship`'s) so maneuvering commands are non-zero -- used to observe how far the
 * ship tries to hold from its target, not just whether it can re-acquire one.
 */
function shortAndLongRangeThrustedConfig() {
    const chainGuns: [ShipDirectionConfig, ChaingunDesign][] = [
        ['FWD', { ...chaingunPlatformChaingun, maxShellRange: 4_000 }],
        ['FWD', { ...chaingunPlatformChaingun, maxShellRange: 20_000 }],
    ];
    return { ...shipConfigurations['demo-ship'], chainGuns };
}

/**
 * A full-traverse turret (so the mount never constrains heading and thrust cost decides it alone)
 * on a hull whose FWD axis is twice as strong as any other — the layout that makes the heading
 * arbitration's chosen thrust axis observable.
 */
function turretOnlyAsymmetricThrustConfig() {
    const chainGuns: [ShipDirectionConfig, ChaingunDesign][] = [['FWD', chaingunPlatformChaingun]];
    const thrusters: [ShipDirectionConfig, ThrusterDesign][] = [
        ['FWD', demoShipThruster],
        ['FWD', demoShipThruster],
        ['PORT', demoShipThruster],
        ['STBD', demoShipThruster],
    ];
    return { ...demoShipConfig, chainGuns, thrusters };
}

function runOneTick(shipMgr: ShipManagerPc | ShipManagerNpc, spaceMgr: SpaceManager) {
    const iterations = makeIterationsData(1, 20);
    for (const id of iterations) {
        shipMgr.update(id);
        spaceMgr.update(id);
    }
}

describe('automation order on player ships', () => {
    it('player ship clears a MOVE order on the next tick', () => {
        const { spaceMgr, shipMgr } = createShipSetup(ShipManagerPc);

        // Simulate a stale order (e.g., carried over from NPC→PC conversion)
        shipMgr.state.order = Order.MOVE;
        shipMgr.state.orderPosition.x = 1000;
        shipMgr.state.orderPosition.y = 2000;

        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.order).to.equal(Order.NONE);
        expect(shipMgr.state.currentTask).to.equal('');
    });

    it('player ship clears an ATTACK order on the next tick', () => {
        const { spaceMgr, shipMgr } = createShipSetup(ShipManagerPc);

        shipMgr.state.order = Order.ATTACK;
        shipMgr.state.orderTargetId = 'some-target';

        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.order).to.equal(Order.NONE);
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(shipMgr.state.orderTargetId).to.be.null;
    });

    it('player ship ignores new GM orders delivered via SpaceManager', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerPc);

        // Issue a move order through the normal command flow
        spaceMgr.state.botOrderCommands.push({
            ids: [shipObj.id],
            order: { type: 'move', position: { x: 5000, y: 5000 } },
        });

        runOneTick(shipMgr, spaceMgr);

        // Order should not be applied to the player ship
        expect(shipMgr.state.order).to.equal(Order.NONE);
    });

    it('player ship smartPilot is not overwritten by automation', () => {
        const { spaceMgr, shipMgr } = createShipSetup(ShipManagerPc);

        // Set a stale order
        shipMgr.state.order = Order.MOVE;
        shipMgr.state.orderPosition.x = 1000;
        shipMgr.state.orderPosition.y = 2000;

        // Set player input
        shipMgr.state.smartPilot.maneuvering.x = 0;
        shipMgr.state.smartPilot.maneuvering.y = 0;
        shipMgr.state.smartPilot.rotation = 0;

        // Run one iteration (not a full tick) to check automation doesn't overwrite
        const iterations = makeIterationsData(0.05, 1);
        for (const id of iterations) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        // The order should be cleared, not executed
        expect(shipMgr.state.order).to.equal(Order.NONE);
    });
});

describe('automation order on NPC ships', () => {
    it('NPC ship executes a MOVE order normally', () => {
        const { spaceMgr, shipMgr } = createShipSetup(ShipManagerNpc);

        // Issue a move order directly on state (as if delivered by getAndApplyOrder)
        shipMgr.state.order = Order.MOVE;
        shipMgr.state.orderPosition.x = 1000;
        shipMgr.state.orderPosition.y = 2000;

        // Run one iteration
        const iterations = makeIterationsData(0.05, 1);
        for (const id of iterations) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        // NPC should still have the order and be executing the task
        expect(shipMgr.state.order).to.equal(Order.MOVE);
        expect(shipMgr.state.currentTask).to.include('Go to');
    });

    it('NPC ship receives GM orders via SpaceManager', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc);

        spaceMgr.state.botOrderCommands.push({
            ids: [shipObj.id],
            order: { type: 'move', position: { x: 5000, y: 5000 } },
        });

        runOneTick(shipMgr, spaceMgr);

        // NPC should have the MOVE order (or NONE if it already completed, but
        // the destination is far away so it should still be executing)
        // After cleanup() fix, completed orders get cleared, but 5000,5000 is far enough
        // that it won't complete in one tick
        expect(shipMgr.state.currentTask).to.include('Go to');
    });
});

describe('NPC threat re-acquisition', () => {
    function createHostile(id: string, faction: Faction, position: XY) {
        const hostile = new Spaceship();
        hostile.id = id;
        hostile.faction = faction;
        hostile.position.setValue(position);
        return hostile;
    }

    it('NPC re-engages a new hostile when its attack target is destroyed', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc);
        shipObj.faction = Faction.Raiders;

        const originalTarget = createHostile('original-target', Faction.Gravitas, XY.byLengthAndDirection(2000, 0));
        const nearbyHostile = createHostile('nearby-hostile', Faction.Gravitas, XY.byLengthAndDirection(2500, 45));
        spaceMgr.insert(originalTarget);
        spaceMgr.insert(nearbyHostile);
        spaceMgr.forceFlushEntities();

        shipMgr.state.order = Order.ATTACK;
        shipMgr.state.orderTargetId = originalTarget.id;
        runOneTick(shipMgr, spaceMgr);
        expect(shipMgr.state.order).to.equal(Order.ATTACK);

        originalTarget.destroyed = true;

        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.order).to.equal(Order.ATTACK);
        expect(shipMgr.state.orderTargetId).to.equal(nearbyHostile.id);
    });

    it('re-acquires a hostile reachable only by a longer-ranged mount than chainGuns[0]', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, shortAndLongRangeConfig());
        shipObj.faction = Faction.Raiders;

        const originalTarget = createHostile('original-target', Faction.Gravitas, XY.byLengthAndDirection(2000, 0));
        // Beyond chainGuns[0]'s 4,000 maxShellRange, but within chainGuns[1]'s 20,000 -- fails if
        // acquisition still keys off chainGuns[0] alone.
        const farHostile = createHostile('far-hostile', Faction.Gravitas, XY.byLengthAndDirection(15_000, 0));
        spaceMgr.insert(originalTarget);
        spaceMgr.insert(farHostile);
        spaceMgr.forceFlushEntities();

        shipMgr.state.order = Order.ATTACK;
        shipMgr.state.orderTargetId = originalTarget.id;
        runOneTick(shipMgr, spaceMgr);

        originalTarget.destroyed = true;
        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.order).to.equal(Order.ATTACK);
        expect(shipMgr.state.orderTargetId).to.equal(farHostile.id);
    });

    it('NPC degrades gracefully to no order when no hostile remains in range', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc);
        shipObj.faction = Faction.Raiders;

        const originalTarget = createHostile('original-target', Faction.Gravitas, XY.byLengthAndDirection(2000, 0));
        spaceMgr.insert(originalTarget);
        spaceMgr.forceFlushEntities();

        shipMgr.state.order = Order.ATTACK;
        shipMgr.state.orderTargetId = originalTarget.id;
        runOneTick(shipMgr, spaceMgr);

        originalTarget.destroyed = true;

        runOneTick(shipMgr, spaceMgr);
        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.order).to.equal(Order.NONE);
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(shipMgr.state.orderTargetId).to.be.null;
    });

    it('an explicit flightDoctrine override changes hold distance without changing the order', () => {
        // ATTACK defaults to STANDOFF, whose trackRange spans the guns' own envelope
        // ([2400, 20000] on this config) -- a target at 3,500 sits inside that band, so the ship
        // holds station. Overriding to SHADOW switches to the fixed [1000, 3000] band, where the
        // same 3,500 target sits outside it, so the ship closes distance instead.
        const distance = 3500;

        function boostAfterOneTick(flightDoctrine: FlightDoctrine) {
            const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, shortAndLongRangeThrustedConfig());
            shipObj.faction = Faction.Raiders;
            const target = new Spaceship();
            target.id = 'target';
            target.faction = Faction.Gravitas;
            target.position.setValue(XY.byLengthAndDirection(distance, 0));
            spaceMgr.insert(target);
            spaceMgr.forceFlushEntities();
            shipMgr.state.flightDoctrine = flightDoctrine;
            shipMgr.state.order = Order.ATTACK;
            shipMgr.state.orderTargetId = target.id;
            const [id] = makeIterationsData(0.05, 1);
            shipMgr.update(id);
            return shipMgr.state.smartPilot.maneuvering.x;
        }

        const standoffBoost = boostAfterOneTick(FlightDoctrine.AUTO);
        const shadowBoost = boostAfterOneTick(FlightDoctrine.SHADOW);

        expect(standoffBoost).to.be.closeTo(0, 0.01);
        expect(shadowBoost).to.be.greaterThan(0.01);
    });

    it('player ship does not auto-engage nearby hostiles when idle', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerPc);
        shipObj.faction = Faction.Raiders;

        const nearbyHostile = createHostile('nearby-hostile', Faction.Gravitas, XY.byLengthAndDirection(2000, 0));
        spaceMgr.insert(nearbyHostile);

        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.order).to.equal(Order.NONE);
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(shipMgr.state.orderTargetId).to.be.null;
    });
});

describe('default-fire gunnery, gated by idleStrategy (issue #2145)', () => {
    function createHostile(id: string, faction: Faction, position: XY) {
        const hostile = new Spaceship();
        hostile.id = id;
        hostile.faction = faction;
        hostile.position.setValue(position);
        return hostile;
    }

    it('an idle NPC (idleStrategy PLAY_DEAD, the default) does not fire on a nearby hostile', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, shipConfigurations['chaingun-platform']);
        shipObj.faction = Faction.Raiders;
        expect(shipMgr.state.idleStrategy).to.equal(IdleStrategy.PLAY_DEAD);

        const hostile = createHostile('hostile', Faction.Gravitas, XY.byLengthAndDirection(5000, 0));
        spaceMgr.insert(hostile);
        spaceMgr.forceFlushEntities();

        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.chainGuns[0]?.isFiring).to.equal(false);
        expect(shipMgr.state.order).to.equal(Order.NONE);
    });

    it('STAND_GROUND fires on a hostile in range without moving, changing velocity, rotating the hull, or setting an order', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, shipConfigurations['chaingun-platform']);
        shipObj.faction = Faction.Raiders;
        shipMgr.state.idleStrategy = IdleStrategy.STAND_GROUND;

        const hostile = createHostile('hostile', Faction.Gravitas, XY.byLengthAndDirection(5000, 0));
        spaceMgr.insert(hostile);
        spaceMgr.forceFlushEntities();

        const positionBefore = XY.clone(shipObj.position);
        const velocityBefore = XY.clone(shipObj.velocity);
        const angleBefore = shipObj.angle;

        // A single tick is enough for the mount to settle (target is dead ahead of the
        // FWD-fitted gun); running much longer would run into the unrelated heat-based
        // cooldown that throttles sustained fire.
        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.chainGuns[0]?.isFiring).to.equal(true);
        expect(shipMgr.state.order).to.equal(Order.NONE);
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(shipMgr.state.orderTargetId).to.be.null;
        expect(XY.equals(shipObj.position, positionBefore, 0.001)).to.equal(true);
        expect(XY.equals(shipObj.velocity, velocityBefore, 0.001)).to.equal(true);
        expect(shipObj.angle).to.be.closeTo(angleBefore, 0.001);
    });

    it('ignores a hostile outside weapons range', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, shipConfigurations['chaingun-platform']);
        shipObj.faction = Faction.Raiders;
        shipMgr.state.idleStrategy = IdleStrategy.STAND_GROUND;

        const maxShellRange = shipMgr.state.chainGuns[0]?.design.maxShellRange ?? 0;
        const farHostile = createHostile(
            'far-hostile',
            Faction.Gravitas,
            XY.byLengthAndDirection(maxShellRange + 1000, 0),
        );
        spaceMgr.insert(farHostile);
        spaceMgr.forceFlushEntities();

        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.chainGuns[0]?.isFiring).to.equal(false);
        expect(shipMgr.state.order).to.equal(Order.NONE);
    });

    // A hull with no rotation capacity has no give-way available, so this isolates the gunnery
    // decision itself: out of arc means out of arc, and the mount holds fire. The give-way turn a
    // rotation-capable hull *would* make is covered separately, above.
    it('a hostile outside the mount bearing arc is not fired upon', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, narrowArcPlatformConfig(10));
        shipObj.faction = Faction.Raiders;
        shipMgr.state.idleStrategy = IdleStrategy.STAND_GROUND;

        // Directly behind the FWD-fitted mount: 180 degrees off, well outside its 10-degree arc.
        const behindHostile = createHostile('behind-hostile', Faction.Gravitas, XY.byLengthAndDirection(5000, 180));
        spaceMgr.insert(behindHostile);
        spaceMgr.forceFlushEntities();

        const angleBefore = shipObj.angle;
        for (let i = 0; i < 5; i++) {
            runOneTick(shipMgr, spaceMgr);
        }

        expect(shipMgr.state.chainGuns[0]?.isFiring).to.equal(false);
        // The fixture's own premise: no rotation capacity, so nothing here can move the hull.
        expect(shipObj.angle).to.be.closeTo(angleBefore, 0.001);
    });

    it('switching idleStrategy back to PLAY_DEAD stops firing and it stays stopped across ticks', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, shipConfigurations['chaingun-platform']);
        shipObj.faction = Faction.Raiders;
        shipMgr.state.idleStrategy = IdleStrategy.STAND_GROUND;

        const hostile = createHostile('hostile', Faction.Gravitas, XY.byLengthAndDirection(5000, 0));
        spaceMgr.insert(hostile);
        spaceMgr.forceFlushEntities();

        runOneTick(shipMgr, spaceMgr);
        expect(shipMgr.state.chainGuns[0]?.isFiring).to.equal(true);

        shipMgr.state.idleStrategy = IdleStrategy.PLAY_DEAD;
        runOneTick(shipMgr, spaceMgr);
        runOneTick(shipMgr, spaceMgr);
        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.chainGuns[0]?.isFiring).to.equal(false);
    });

    it('an explicit MOVE order still fires on a hostile in range despite idleStrategy PLAY_DEAD', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, shipConfigurations['chaingun-platform']);
        shipObj.faction = Faction.Raiders;
        expect(shipMgr.state.idleStrategy).to.equal(IdleStrategy.PLAY_DEAD);

        const hostile = createHostile('hostile', Faction.Gravitas, XY.byLengthAndDirection(5000, 0));
        spaceMgr.insert(hostile);
        spaceMgr.forceFlushEntities();

        // Same bearing (0 degrees) the ship already faces and the hostile sits on, so the MOVE
        // order needs no hull rotation and doesn't interfere with the mount settling on target.
        shipMgr.state.order = Order.MOVE;
        shipMgr.state.orderPosition.x = 50_000;
        shipMgr.state.orderPosition.y = 0;

        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.chainGuns[0]?.isFiring).to.equal(true);
    });

    it('a reachable ATTACK-ordered target is engaged exclusively, ignoring a nearer opportunistic hostile', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, shipConfigurations['chaingun-platform']);
        shipObj.faction = Faction.Raiders;

        const orderedTarget = createHostile('ordered-target', Faction.Gravitas, XY.byLengthAndDirection(5000, 0));
        const nearerHostile = createHostile('nearer-hostile', Faction.Gravitas, XY.byLengthAndDirection(3000, 90));
        spaceMgr.insert(orderedTarget);
        spaceMgr.insert(nearerHostile);
        spaceMgr.forceFlushEntities();

        shipMgr.state.order = Order.ATTACK;
        shipMgr.state.orderTargetId = orderedTarget.id;

        runOneTick(shipMgr, spaceMgr);

        // Aimed at the ordered target's bearing (0 degrees), not the nearer hostile's (90).
        expect(shipMgr.state.chainGuns[0]?.bearingCommand).to.be.closeTo(0, 1);
    });

    it('an ATTACK order on an out-of-range target takes a free opportunity shot at the nearest in-range hostile', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, shipConfigurations['chaingun-platform']);
        shipObj.faction = Faction.Raiders;

        const maxShellRange = shipMgr.state.chainGuns[0]?.design.maxShellRange ?? 0;
        const unreachableOrderedTarget = createHostile(
            'unreachable-ordered-target',
            Faction.Gravitas,
            XY.byLengthAndDirection(maxShellRange + 5_000, 0),
        );
        const opportunityHostile = createHostile(
            'opportunity-hostile',
            Faction.Gravitas,
            XY.byLengthAndDirection(5000, 90),
        );
        spaceMgr.insert(unreachableOrderedTarget);
        spaceMgr.insert(opportunityHostile);
        spaceMgr.forceFlushEntities();

        shipMgr.state.order = Order.ATTACK;
        shipMgr.state.orderTargetId = unreachableOrderedTarget.id;

        const positionBefore = XY.clone(shipObj.position);
        const angleBefore = shipObj.angle;
        runOneTick(shipMgr, spaceMgr);

        // Aimed at the opportunity hostile's bearing (90 degrees), not the unreachable order's (0).
        expect(shipMgr.state.chainGuns[0]?.bearingCommand).to.be.closeTo(90, 1);
        // The order itself is untouched — gunnery never rewrites it.
        expect(shipMgr.state.order).to.equal(Order.ATTACK);
        expect(shipMgr.state.orderTargetId).to.equal(unreachableOrderedTarget.id);
        // Opportunity fire never moves or turns the hull.
        expect(XY.equals(shipObj.position, positionBefore, 0.001)).to.equal(true);
        expect(shipObj.angle).to.be.closeTo(angleBefore, 0.001);
    });

    it('an ATTACK order on a target no mount can bear on (but in range) takes an opportunity shot instead', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, narrowArcPlatformConfig(10));
        shipObj.faction = Faction.Raiders;

        // Directly behind the FWD-fitted mount: outside its 10-degree arc, though well in range.
        const unbearableOrderedTarget = createHostile(
            'unbearable-ordered-target',
            Faction.Gravitas,
            XY.byLengthAndDirection(2000, 180),
        );
        const opportunityHostile = createHostile(
            'opportunity-hostile',
            Faction.Gravitas,
            XY.byLengthAndDirection(5000, 0),
        );
        spaceMgr.insert(unbearableOrderedTarget);
        spaceMgr.insert(opportunityHostile);
        spaceMgr.forceFlushEntities();

        shipMgr.state.order = Order.ATTACK;
        shipMgr.state.orderTargetId = unbearableOrderedTarget.id;

        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.chainGuns[0]?.bearingCommand).to.be.closeTo(0, 1);
    });

    it('returns fire to the ordered target within one tick of it becoming reachable again', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, shipConfigurations['chaingun-platform']);
        shipObj.faction = Faction.Raiders;

        const maxShellRange = shipMgr.state.chainGuns[0]?.design.maxShellRange ?? 0;
        const orderedTarget = createHostile(
            'ordered-target',
            Faction.Gravitas,
            XY.byLengthAndDirection(maxShellRange + 5_000, 0),
        );
        const opportunityHostile = createHostile(
            'opportunity-hostile',
            Faction.Gravitas,
            XY.byLengthAndDirection(5000, 90),
        );
        spaceMgr.insert(orderedTarget);
        spaceMgr.insert(opportunityHostile);
        spaceMgr.forceFlushEntities();

        shipMgr.state.order = Order.ATTACK;
        shipMgr.state.orderTargetId = orderedTarget.id;

        runOneTick(shipMgr, spaceMgr);
        expect(shipMgr.state.chainGuns[0]?.bearingCommand).to.be.closeTo(90, 1); // opportunity fire

        orderedTarget.position.setValue(XY.byLengthAndDirection(5000, 0)); // now back in range
        spaceMgr.forceFlushEntities();
        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.chainGuns[0]?.bearingCommand).to.be.closeTo(0, 1); // back on the primary
    });

    it('yields to an opportunity hostile while the ordered target outruns the shell', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, shipConfigurations['chaingun-platform']);
        shipObj.faction = Faction.Raiders;

        const bulletSpeed = shipMgr.state.chainGuns[0]?.design.bulletSpeed ?? 0;
        // Dead ahead and well inside the envelope, so range and bearing both say "take the shot" —
        // but it recedes faster than the shell flies, which no bearing can compensate for.
        const outrunningTarget = createHostile('outrunning-target', Faction.Gravitas, XY.byLengthAndDirection(5000, 0));
        outrunningTarget.velocity.setValue(XY.byLengthAndDirection(bulletSpeed * 1.2, 0));
        const opportunityHostile = createHostile(
            'opportunity-hostile',
            Faction.Gravitas,
            XY.byLengthAndDirection(5000, 90),
        );
        spaceMgr.insert(outrunningTarget);
        spaceMgr.insert(opportunityHostile);
        spaceMgr.forceFlushEntities();

        shipMgr.state.order = Order.ATTACK;
        shipMgr.state.orderTargetId = outrunningTarget.id;

        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.chainGuns[0]?.bearingCommand).to.be.closeTo(90, 1);
    });

    it('opportunity fire changes nothing about position, velocity, or hull angle vs. a control run with no opportunity hostile', () => {
        const maxShellRange = shipConfigurations['chaingun-platform'].chainGuns[0][1].maxShellRange;
        const orderedTargetPosition = XY.byLengthAndDirection(maxShellRange + 5_000, 0);

        function runScenario(withOpportunityHostile: boolean) {
            const { spaceMgr, shipObj, shipMgr } = createShipSetup(
                ShipManagerNpc,
                shipConfigurations['chaingun-platform'],
            );
            shipObj.faction = Faction.Raiders;
            const orderedTarget = createHostile('ordered-target', Faction.Gravitas, orderedTargetPosition);
            spaceMgr.insert(orderedTarget);
            if (withOpportunityHostile) {
                spaceMgr.insert(
                    createHostile('opportunity-hostile', Faction.Gravitas, XY.byLengthAndDirection(5000, 90)),
                );
            }
            spaceMgr.forceFlushEntities();
            shipMgr.state.order = Order.ATTACK;
            shipMgr.state.orderTargetId = orderedTarget.id;
            for (let i = 0; i < 5; i++) {
                runOneTick(shipMgr, spaceMgr);
            }
            return { position: XY.clone(shipObj.position), velocity: XY.clone(shipObj.velocity), angle: shipObj.angle };
        }

        const withOpportunity = runScenario(true);
        const control = runScenario(false);

        expect(XY.equals(withOpportunity.position, control.position, 0.001)).to.equal(true);
        expect(XY.equals(withOpportunity.velocity, control.velocity, 0.001)).to.equal(true);
        expect(withOpportunity.angle).to.be.closeTo(control.angle, 0.001);
    });

    it('selects the nearest reachable hostile and starts turning the hull to bring it to bear, even over a farther one already bearable', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, narrowArcPlatformConfig(10));
        shipObj.faction = Faction.Raiders;
        shipMgr.state.idleStrategy = IdleStrategy.STAND_GROUND;

        // Nearer, but 180 degrees off the FWD-fitted mount's 10-degree arc -- reachable by range,
        // and the idle path (`aimIdleHullAtGunneryTarget`) will turn the hull toward it over time.
        const nearUnbearable = createHostile('near-unbearable', Faction.Gravitas, XY.byLengthAndDirection(3000, 180));
        // Farther, but dead ahead -- squarely in the arc.
        const farBearable = createHostile('far-bearable', Faction.Gravitas, XY.byLengthAndDirection(5000, 0));
        spaceMgr.insert(nearUnbearable);
        spaceMgr.insert(farBearable);
        spaceMgr.forceFlushEntities();

        runOneTick(shipMgr, spaceMgr);

        // The mount itself hasn't had time to swing; it's still clamped at its own arc limit
        // pointed toward the nearer target's raw line of sight, not toward the farther one.
        expect(shipMgr.state.chainGuns[0]?.bearingCommand).to.be.closeTo(10, 1);
    });

    it('stops firing on a cached target that swings out of the arc, while still holding and aiming at it', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, narrowArcPlatformConfig(10));
        shipObj.faction = Faction.Raiders;
        shipMgr.state.idleStrategy = IdleStrategy.STAND_GROUND;

        const hostile = createHostile('hostile', Faction.Gravitas, XY.byLengthAndDirection(5000, 0));
        spaceMgr.insert(hostile);
        spaceMgr.forceFlushEntities();

        runOneTick(shipMgr, spaceMgr);
        expect(shipMgr.state.chainGuns[0]?.bearingCommand).to.be.closeTo(0, 1);

        // The same (cached) hostile swings around to well outside the 10-degree arc.
        hostile.position.setValue(XY.byLengthAndDirection(5000, 180));
        spaceMgr.forceFlushEntities();
        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.chainGuns[0]?.isFiring).to.equal(false);
        // Unbearable is not a reason to let a hostile go — the target stays cached and the mount
        // stays commanded toward it, pinned at the arc limit it cannot traverse past, which is what
        // leaves the hull free to turn and bring it back into the arc.
        expect(Math.abs(shipMgr.state.chainGuns[0]?.bearingCommand ?? 0)).to.be.closeTo(10, 1);
    });

    it('opens blind on a skewed mount, then dials the skew out of its aim as it observes the error', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, narrowArcPlatformConfig(30));
        shipObj.faction = Faction.Raiders;
        shipMgr.state.idleStrategy = IdleStrategy.STAND_GROUND;
        const gun = shipMgr.state.chainGuns[0];
        expect(gun).to.not.equal(undefined);
        // Damage has skewed the mount 30 degrees off where it was fitted, still inside the design's
        // 45-degree maxBearingSkew so the mount isn't `broken`.
        gun.bearingSkew = 30;

        spaceMgr.insert(createHostile('hostile', Faction.Gravitas, XY.byLengthAndDirection(5000, 0)));
        spaceMgr.forceFlushEntities();

        runOneTick(shipMgr, spaceMgr);

        // The automation never reads `bearingSkew` (#2176/#2177) — its belief comes only from
        // observing where its commands actually landed. One tick in, the exponential filter has
        // taken a single step toward the defect, nowhere near compensating it, so the mount is
        // still bent most of the way off target: a fresh defect has an immediate tactical cost.
        expect(Math.abs(gun.bearingCommand)).to.be.lessThan(10);

        // Given seconds of continued engagement the tracked estimate converges on the real defect
        // and the firing line comes back onto the target, at which point the mount opens up.
        for (let i = 0; i < 600; i++) {
            runOneTick(shipMgr, spaceMgr);
        }
        expect(gun.hullBearing).to.be.closeTo(0, 1);
        expect(gun.isFiring).to.equal(true);
    });

    it('gives way with the hull for a mount whose skew has pushed the target out of its traverse', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, rotatingNarrowArcPlatformConfig(20));
        shipObj.faction = Faction.Raiders;
        shipMgr.state.idleStrategy = IdleStrategy.STAND_GROUND;
        const gun = shipMgr.state.chainGuns[0];
        expect(gun).to.not.equal(undefined);
        // 40 degrees of skew against 20 degrees of traverse: dead ahead is now out of reach, even
        // though it sits squarely inside the arc the mount was fitted with.
        gun.bearingSkew = 40;

        spaceMgr.insert(createHostile('hostile', Faction.Gravitas, XY.byLengthAndDirection(5000, 0)));
        spaceMgr.forceFlushEntities();

        for (let i = 0; i < 60; i++) {
            runOneTick(shipMgr, spaceMgr);
        }

        // Reading the window off `fittedBearing` alone calls the target bearable and the hull never
        // gives way; the mount then sits at its clamped limit, 20 degrees off, forever.
        expect(gun.isFiring, 'mount bears and fires after the give-way turn').to.equal(true);
        // The hull has yielded exactly the skew, putting the target on the mount's rest bearing.
        expect(toDegreesDelta(shipObj.angle)).to.be.closeTo(-40, 2);

        // And it holds there: releasing the heading the moment a mount first bears would leave the
        // hull's turn speed unarrested, sweeping it back out of the window once per revolution.
        const settled = shipObj.angle;
        for (let i = 0; i < 100; i++) {
            runOneTick(shipMgr, spaceMgr);
            expect(gun.isFiring, `still firing at tick ${i}`).to.equal(true);
        }
        expect(toDegreesDelta(shipObj.angle - settled)).to.be.closeTo(0, 1);
    });

    it('points the strong thrust axis along the closing vector, not along the target’s own velocity', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, turretOnlyAsymmetricThrustConfig());
        shipObj.faction = Faction.Raiders;

        // Beyond the guns' 12,000m envelope, so the ship is closing: this tick's thrust command is
        // `moveToTarget`, straight at the target. The target's own 5 km/s crossing velocity is a
        // vector the ship is not being accelerated along at all, and arbitrating heading against it
        // would swing the hull 90 degrees off the approach it is actually flying.
        const target = createHostile('target', Faction.Gravitas, XY.byLengthAndDirection(30_000, 0));
        target.velocity.setValue({ x: 0, y: 5000 });
        spaceMgr.insert(target);
        spaceMgr.forceFlushEntities();

        shipMgr.state.order = Order.ATTACK;
        shipMgr.state.orderTargetId = target.id;

        for (const id of makeIterationsData(0.05, 1)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        // The hull already points at the target, and the offset that puts its strongest (FWD) axis
        // on the closing vector is 0 -- so there is nothing to turn.
        expect(shipMgr.state.smartPilot.rotation, 'rotation command while closing').to.be.closeTo(0, 0.05);
    });

    it('does not damp against a step in the commanded heading as if it were a sweep', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, rotatingNarrowArcPlatformConfig(20));
        shipObj.faction = Faction.Raiders;
        shipMgr.state.idleStrategy = IdleStrategy.STAND_GROUND;
        // Well out of the 20-degree mount's reach, so the idle give-way turn engages and commands a
        // heading. The give-way latch then keeps it commanding one for the rest of the test.
        const hostile = createHostile('hostile', Faction.Gravitas, XY.byLengthAndDirection(5000, 82));
        spaceMgr.insert(hostile);
        spaceMgr.forceFlushEntities();
        const oneTick = () => {
            for (const id of makeIterationsData(0.05, 1)) {
                shipMgr.update(id);
                spaceMgr.update(id);
            }
        };
        oneTick();

        // The hostile jumps 40 degrees, stepping the commanded heading by the same 40 across one
        // 0.05s tick -- 800 deg/s, more than an order of magnitude past what this hull's own
        // 60 deg/s^2 could build up in a second, so it is a step and not a sweep. The hull is pinned
        // 2 degrees short of the newly commanded heading, at rest, so the *only* thing this second
        // tick measures is that reference rate.
        hostile.position.setValue(XY.byLengthAndDirection(5000, 42));
        spaceMgr.forceFlushEntities();
        shipObj.angle = 40;
        shipObj.turnSpeed = 0;
        oneTick();

        // The heading now wanted is ~2 degrees away, which a hull at rest answers by turning gently
        // toward it. Treating the step as a sweep instead reads the hull as already racing past that
        // heading at 800 deg/s and commands full counter-rotation -- the wrong way, at full scale.
        expect(shipMgr.state.smartPilot.rotation, 'rotation command after a heading step').to.be.within(0.05, 0.95);
    });

    it('drops a cached target that closes inside minShellRange, consistent with canBearOn', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, shipConfigurations['chaingun-platform']);
        shipObj.faction = Faction.Raiders;
        shipMgr.state.idleStrategy = IdleStrategy.STAND_GROUND;

        const minShellRange = shipMgr.state.chainGuns[0]?.design.minShellRange ?? 0;
        const hostile = createHostile('hostile', Faction.Gravitas, XY.byLengthAndDirection(5000, 0));
        // A second hostile, farther out and abeam, so where the mount points says which one the
        // ship is holding — the drop itself is otherwise invisible on a single-hostile hull.
        const farHostile = createHostile('far-hostile', Faction.Gravitas, XY.byLengthAndDirection(6000, 90));
        spaceMgr.insert(hostile);
        spaceMgr.insert(farHostile);
        spaceMgr.forceFlushEntities();

        runOneTick(shipMgr, spaceMgr);
        expect(shipMgr.state.chainGuns[0]?.isFiring).to.equal(true);
        expect(shipMgr.state.chainGuns[0]?.bearingCommand).to.be.closeTo(0, 1);

        // Closes inside the gun's own dead zone.
        hostile.position.setValue(XY.byLengthAndDirection(minShellRange - 500, 0));
        spaceMgr.forceFlushEntities();
        runOneTick(shipMgr, spaceMgr);

        // Dropped, and the farther hostile picked up in its place — the mount is now swinging onto
        // that one, and reports no fire until it gets there.
        expect(shipMgr.state.chainGuns[0]?.bearingCommand).to.be.closeTo(90, 1);
        expect(shipMgr.state.chainGuns[0]?.isFiring).to.equal(false);
    });

    it('throttles the rescan on the ATTACK-target-unreachable branch, not per-tick', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, shipConfigurations['chaingun-platform']);
        shipObj.faction = Faction.Raiders;

        const maxShellRange = shipMgr.state.chainGuns[0]?.design.maxShellRange ?? 0;
        const unreachableOrderedTarget = createHostile(
            'unreachable-ordered-target',
            Faction.Gravitas,
            XY.byLengthAndDirection(maxShellRange + 5_000, 0),
        );
        spaceMgr.insert(unreachableOrderedTarget);
        spaceMgr.forceFlushEntities();

        shipMgr.state.order = Order.ATTACK;
        shipMgr.state.orderTargetId = unreachableOrderedTarget.id;

        // A single 0.05s tick: no opportunity hostile yet, so the cooldown-starts-at-zero initial
        // scan finds nothing and arms the 1s rescan cooldown.
        for (const id of makeIterationsData(0.05, 1)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }
        expect(shipMgr.state.chainGuns[0]?.isFiring).to.equal(false);

        // A hostile now appears, well within the still-running cooldown window.
        const opportunityHostile = createHostile(
            'opportunity-hostile',
            Faction.Gravitas,
            XY.byLengthAndDirection(5000, 90),
        );
        spaceMgr.insert(opportunityHostile);
        spaceMgr.forceFlushEntities();

        // 0.75s more: short of the 1s cooldown -- still throttled, not yet picked up.
        for (const id of makeIterationsData(0.75, 15)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }
        expect(shipMgr.state.chainGuns[0]?.bearingCommand).to.be.closeTo(0, 1); // still aimed at the (unreachable) primary's bearing

        // Crosses the 1s cooldown mark: the rescan now runs and picks up the opportunity hostile.
        for (const id of makeIterationsData(0.3, 6)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }
        expect(shipMgr.state.chainGuns[0]?.bearingCommand).to.be.closeTo(90, 1);
    });

    it('treats a fast crosser inside the arc but outside the firing solution as unbearable, and gives way', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, rotatingNarrowArcPlatformConfig(20));
        shipObj.faction = Faction.Raiders;
        shipMgr.state.idleStrategy = IdleStrategy.STAND_GROUND;

        // 10 degrees off the FWD mount's bearing -- squarely inside its 20-degree arc on the raw
        // line of sight. But the target crosses at 800 m/s against a 2,500 m/s shell, so the point
        // the mount must actually point at leads it by ~18 degrees, out past the arc entirely.
        const hostile = createHostile('crosser', Faction.Gravitas, XY.byLengthAndDirection(5000, 10));
        hostile.velocity.setValue(XY.byLengthAndDirection(800, 100));
        spaceMgr.insert(hostile);
        spaceMgr.forceFlushEntities();

        for (const id of makeIterationsData(0.5, 10)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        // Gating on the line of sight calls this bearable, so the hull never gives way and the mount
        // sits clamped at its limit, aiming at a solution it cannot reach.
        expect(Math.abs(toDegreesDelta(shipObj.angle)), 'hull gave way toward the firing solution').to.be.greaterThan(
            1,
        );
    });

    it('does not carry a stale rescan cooldown across an engagement, delaying pickup when the primary dies', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, shipConfigurations['chaingun-platform']);
        shipObj.faction = Faction.Raiders;

        const maxShellRange = shipMgr.state.chainGuns[0]?.design.maxShellRange ?? 0;
        const orderedTarget = createHostile(
            'ordered-target',
            Faction.Gravitas,
            XY.byLengthAndDirection(maxShellRange + 5_000, 0),
        );
        spaceMgr.insert(orderedTarget);
        spaceMgr.forceFlushEntities();
        shipMgr.state.order = Order.ATTACK;
        shipMgr.state.orderTargetId = orderedTarget.id;

        // One tick with the primary unreachable and nothing else around: the scan finds nothing and
        // arms the 1s cooldown.
        for (const id of makeIterationsData(0.05, 1)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        // The primary closes to a reachable distance and is engaged for two full seconds -- twice
        // the cooldown. Elapsed time is elapsed time whether or not a scan is wanted, so by the end
        // of this the cooldown is long expired.
        orderedTarget.position.setValue(XY.byLengthAndDirection(5000, 0));
        spaceMgr.forceFlushEntities();
        for (const id of makeIterationsData(2, 40)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }
        expect(shipMgr.state.chainGuns[0]?.bearingCommand).to.be.closeTo(0, 1);

        // The primary dies with another hostile already abeam.
        spaceMgr.insert(createHostile('opportunity-hostile', Faction.Gravitas, XY.byLengthAndDirection(5000, 90)));
        spaceMgr.forceFlushEntities();
        orderedTarget.destroyed = true;
        for (const id of makeIterationsData(0.05, 1)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        // Ticking the cooldown only on the branch that scans leaves it frozen for the whole
        // engagement, so the hull would sit idle for a further second before noticing this hostile.
        expect(shipMgr.state.chainGuns[0]?.bearingCommand).to.be.closeTo(90, 1);
    });

    it('disengaging clears isFiring on every mount, not only the control weapon', () => {
        const twoMountConfig = {
            ...shipConfigurations['chaingun-platform'],
            chainGuns: [
                ['FWD', chaingunPlatformChaingun],
                ['STBD', chaingunPlatformChaingun],
            ] as [ShipDirectionConfig, ChaingunDesign][],
        };
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, twoMountConfig);
        shipObj.faction = Faction.Raiders;
        shipMgr.state.idleStrategy = IdleStrategy.STAND_GROUND;

        const hostile = createHostile('hostile', Faction.Gravitas, XY.byLengthAndDirection(5000, 0));
        spaceMgr.insert(hostile);
        spaceMgr.forceFlushEntities();

        runOneTick(shipMgr, spaceMgr);
        expect(shipMgr.state.chainGuns[0]?.isFiring).to.equal(true);
        // Simulates the second mount having been left firing by some other path -- disengaging
        // must not leave it behind.
        shipMgr.state.chainGuns[1].isFiring = true;

        shipMgr.state.idleStrategy = IdleStrategy.PLAY_DEAD;
        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.chainGuns[0]?.isFiring).to.equal(false);
        expect(shipMgr.state.chainGuns[1]?.isFiring).to.equal(false);
    });

    it('a docking NPC still fires on a hostile in range -- docking suppresses movement, not gunnery', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, shipConfigurations['chaingun-platform']);
        shipObj.faction = Faction.Raiders;
        shipMgr.state.idleStrategy = IdleStrategy.STAND_GROUND;
        // This test is about gunnery surviving docking, not about hull agility -- pin power to MAX
        // so the hull's rotationCapacity (now scaled by maneuvering effectiveness, issue #2208)
        // still swings onto the shared bearing within the single simulated second below.
        shipMgr.state.maneuvering.power = PowerLevel.MAX;

        const dockTarget = createHostile('dock-target', Faction.Raiders, XY.byLengthAndDirection(1000, 45));
        spaceMgr.insert(dockTarget);
        shipMgr.state.docking.targetId = dockTarget.id;
        shipMgr.state.docking.mode = DockingMode.DOCKING;

        // Same bearing (45 degrees) as the dock target, so the hull rotation docking induces
        // doesn't also move the mount's desired bearing away from the hostile mid-swing.
        const hostile = createHostile('hostile', Faction.Gravitas, XY.byLengthAndDirection(5000, 45));
        spaceMgr.insert(hostile);
        spaceMgr.forceFlushEntities();

        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.chainGuns[0]?.isFiring).to.equal(true);
    });

    it('selects a target bearable by only one of several mounts, and only that mount fires', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, threeMountNarrowArcConfig(10));
        shipObj.faction = Faction.Raiders;
        shipMgr.state.idleStrategy = IdleStrategy.STAND_GROUND;

        // Dead on the STBD mount's fitted bearing (-90); well outside FWD's (0) and AFT's (180)
        // 10-degree arcs.
        const hostile = createHostile('hostile', Faction.Gravitas, XY.byLengthAndDirection(5000, -90));
        spaceMgr.insert(hostile);
        spaceMgr.forceFlushEntities();

        runOneTick(shipMgr, spaceMgr);

        const [fwd, stbd, aft] = shipMgr.state.chainGuns;
        expect(stbd.isFiring, 'STBD (the only mount that bears) should be firing').to.equal(true);
        expect(fwd.isFiring, "FWD (can't bear) should not be firing").to.equal(false);
        expect(aft.isFiring, "AFT (can't bear) should not be firing").to.equal(false);
    });

    it('fires from every mount that bears on the chosen target -- a 3-mount hull fires all three', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, threeMountFullTraverseConfig());
        shipObj.faction = Faction.Raiders;
        shipMgr.state.idleStrategy = IdleStrategy.STAND_GROUND;

        const hostile = createHostile('hostile', Faction.Gravitas, XY.byLengthAndDirection(5000, 0));
        spaceMgr.insert(hostile);
        spaceMgr.forceFlushEntities();

        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.chainGuns.length).to.equal(3);
        for (const chainGun of shipMgr.state.chainGuns) {
            expect(chainGun.isFiring, `mount fitted at ${chainGun.fittedBearing} should be firing`).to.equal(true);
        }
    });

    it('still engages exactly one target per tick -- every mount aims at the same hostile, never split', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, threeMountFullTraverseConfig());
        shipObj.faction = Faction.Raiders;
        shipMgr.state.idleStrategy = IdleStrategy.STAND_GROUND;

        const hostileA = createHostile('hostile-a', Faction.Gravitas, XY.byLengthAndDirection(5000, 0));
        const hostileB = createHostile('hostile-b', Faction.Gravitas, XY.byLengthAndDirection(5000, 120));
        spaceMgr.insert(hostileA);
        spaceMgr.insert(hostileB);
        spaceMgr.forceFlushEntities();

        runOneTick(shipMgr, spaceMgr);

        // Every mount's desired global bearing points at the SAME hostile (whichever the ship
        // picked), never split between the two.
        const globalBearings = shipMgr.state.chainGuns.map((gun) =>
            toDegreesDelta(gun.bearingCommand + gun.fittedBearing + shipObj.angle),
        );
        const uniqueBearings = new Set(globalBearings.map((b) => Math.round(b)));
        expect(uniqueBearings.size, `expected one shared bearing, got ${[...uniqueBearings].join(',')}`).to.equal(1);
    });

    it('dials the shell range from the muzzle, not the hull center, on a large-radius hull', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc, shipConfigurations['chaingun-platform']);
        shipObj.faction = Faction.Raiders;
        // createShipSetup's bare `new Spaceship()` skips the `radius` a real spawn (`Spaceship.init`)
        // assigns from the ship model -- set it explicitly so this hull's real 800m radius (the
        // muzzle's offset ahead of `ship.position`) is actually exercised.
        shipObj.radius = shipConfigurations['chaingun-platform'].radius;
        shipMgr.state.idleStrategy = IdleStrategy.STAND_GROUND;

        const hostile = createHostile('hostile', Faction.Gravitas, XY.byLengthAndDirection(5000, 0));
        spaceMgr.insert(hostile);
        spaceMgr.forceFlushEntities();

        runOneTick(shipMgr, spaceMgr);

        expect(
            shipMgr.state.chainGuns[0]?.isFiring,
            'a stationary target dead ahead, well inside the envelope, should still be hit -- the muzzle sits `radius` ahead of `ship.position` on the same firing line, so the shell must travel `radius` less than the ship-center-to-target distance to land on target',
        ).to.equal(true);
    });
});

describe('NPC ATTACK order with a bolted (non-traversing) chain gun', () => {
    function armorHealthSum(state: ReturnType<typeof makeShipState>) {
        let sum = 0;
        for (const plate of state.armor.armorPlates) {
            sum += plate.healthRatio;
        }
        return sum;
    }

    it('brings the bolted gun to bear and damages a stationary target within 5 sim-minutes', () => {
        const spaceMgr = new SpaceManager();
        const die = new MockDie();
        die.expectedRoll = 1;

        // .init() (not just setting .id/.position) matters here: it's what sets the SpaceObject's
        // physical radius from the ship config, which real hit detection depends on.
        const attacker = new Spaceship().init(
            'attacker',
            Vec2.make(XY.byLengthAndDirection(20_000, 0)),
            'dragonfly-MK1',
            Faction.Raiders,
        );
        const attackerState = makeShipState(attacker.id, shipConfigurations['dragonfly-MK1']);
        attackerState.isPlayerShip = false;
        const attackerMgr = new ShipManagerNpc(attacker, attackerState, spaceMgr, die);

        const target = new Spaceship().init('target', Vec2.make(XY.zero), 'large-station', Faction.Gravitas);
        const targetState = makeShipState(target.id, shipConfigurations['large-station']);
        const targetMgr = new ShipManagerNpc(target, targetState, spaceMgr, die);

        spaceMgr.insert(attacker);
        spaceMgr.insert(target);
        spaceMgr.forceFlushEntities();

        attackerMgr.state.order = Order.ATTACK;
        attackerMgr.state.orderTargetId = target.id;

        const initialArmor = armorHealthSum(targetState);
        let firingTicks = 0;
        let totalTicks = 0;
        for (const id of makeIterationsData(300, 6000)) {
            attackerMgr.update(id);
            targetMgr.update(id);
            spaceMgr.update(id);
            totalTicks++;
            if (attackerMgr.state.chainGuns[0]?.isFiring) firingTicks++;
        }

        // A1: measurably reduces the station's armour within 5 sim-minutes
        expect(armorHealthSum(targetState)).to.be.lessThan(initialArmor);
        // A2: the bolted mount actually fires during the engagement (duty cycle > 0). The pass-by
        // pursuit dynamics here are chaotic — the exact duty cycle is sensitive to floating-point
        // rounding and varies between environments — so this pins presence, not a specific rate.
        expect(firingTicks / totalTicks).to.be.greaterThan(0);
        // A3: player ships are unaffected (pinned by existing tests in this file)
    });

    it('sustains a non-zero firing duty cycle for 10 sim-minutes with no permanent stoppage (issue #2108)', () => {
        const spaceMgr = new SpaceManager();
        const die = new MockDie();
        die.expectedRoll = 1;

        const attacker = new Spaceship().init(
            'attacker',
            Vec2.make(XY.byLengthAndDirection(20_000, 0)),
            'dragonfly-MK1',
            Faction.Raiders,
        );
        const attackerState = makeShipState(attacker.id, shipConfigurations['dragonfly-MK1']);
        attackerState.isPlayerShip = false;
        const attackerMgr = new ShipManagerNpc(attacker, attackerState, spaceMgr, die);

        const target = new Spaceship().init('target', Vec2.make(XY.zero), 'large-station', Faction.Gravitas);
        const targetState = makeShipState(target.id, shipConfigurations['large-station']);
        const targetMgr = new ShipManagerNpc(target, targetState, spaceMgr, die);

        spaceMgr.insert(attacker);
        spaceMgr.insert(target);
        spaceMgr.forceFlushEntities();

        attackerMgr.state.order = Order.ATTACK;
        attackerMgr.state.orderTargetId = target.id;

        const gun = attackerMgr.state.chainGuns[0];
        const totalAmmoRemaining = () =>
            shellAmmoTypes.reduce((sum, ammoType) => sum + attackerState.magazine.getCount(ammoType), 0);
        let everFired = false;
        let falseStreakSeconds = 0;
        let maxFalseStreakSecondsWithAmmo = 0;
        let firingTicks = 0;
        let totalTicks = 0;
        for (const id of makeIterationsData(600, 12000)) {
            attackerMgr.update(id);
            targetMgr.update(id);
            spaceMgr.update(id);
            totalTicks++;
            if (gun.isFiring) {
                everFired = true;
                firingTicks++;
                falseStreakSeconds = 0;
            } else if (everFired) {
                // only count stoppages once the engagement has actually started — closing the
                // initial 20km approach legitimately keeps the gun quiet for a while.
                falseStreakSeconds += id.deltaSeconds;
                if (totalAmmoRemaining() > 0) {
                    maxFalseStreakSecondsWithAmmo = Math.max(maxFalseStreakSecondsWithAmmo, falseStreakSeconds);
                }
            }
        }

        // A2: once engaged, a healthy raider with ammo and the target in its envelope should
        // never go permanently silent — no stoppage should outlast a normal reposition/reload.
        expect(maxFalseStreakSecondsWithAmmo).to.be.lessThan(30);
        expect(firingTicks / totalTicks).to.be.greaterThan(0);
        // A4: the gun itself stays healthy throughout
        expect(gun.effectiveness).to.be.greaterThan(0);
    });

    it('A4: two raiders spawned together in a wave bring measurable damage to the shared target', () => {
        const spaceMgr = new SpaceManager();
        const die = new MockDie();
        die.expectedRoll = 1;

        // Mirrors wave-defence spawn geometry: raiders spawn together ~140km out with a small
        // (hundreds of meters) jitter offset, then ATTACK the same station. A proximity-fuzed
        // shell must not detonate on a wingman flying in formation before it reaches the target
        // — see the space-manager fix gating checkUnguidedProximityFuzes on faction (issue #2082).
        const spawnCenter = XY.byLengthAndDirection(140_000, 0);
        const raider1 = new Spaceship().init('raider1', Vec2.make(spawnCenter), 'dragonfly-MK1', Faction.Raiders);
        const raider1State = makeShipState(raider1.id, shipConfigurations['dragonfly-MK1']);
        raider1State.isPlayerShip = false;
        const raider1Mgr = new ShipManagerNpc(raider1, raider1State, spaceMgr, die);

        const raider2Position = XY.add(spawnCenter, XY.byLengthAndDirection(150, 40));
        const raider2 = new Spaceship().init('raider2', Vec2.make(raider2Position), 'dragonfly-MK1', Faction.Raiders);
        const raider2State = makeShipState(raider2.id, shipConfigurations['dragonfly-MK1']);
        raider2State.isPlayerShip = false;
        const raider2Mgr = new ShipManagerNpc(raider2, raider2State, spaceMgr, die);

        const target = new Spaceship().init('target', Vec2.make(XY.zero), 'large-station', Faction.Gravitas);
        const targetState = makeShipState(target.id, shipConfigurations['large-station']);
        const targetMgr = new ShipManagerNpc(target, targetState, spaceMgr, die);

        spaceMgr.insert(raider1);
        spaceMgr.insert(raider2);
        spaceMgr.insert(target);
        spaceMgr.forceFlushEntities();

        raider1Mgr.state.order = Order.ATTACK;
        raider1Mgr.state.orderTargetId = target.id;
        raider2Mgr.state.order = Order.ATTACK;
        raider2Mgr.state.orderTargetId = target.id;

        const initialArmor = armorHealthSum(targetState);
        for (const id of makeIterationsData(600, 12000)) {
            raider1Mgr.update(id);
            raider2Mgr.update(id);
            targetMgr.update(id);
            spaceMgr.update(id);
        }

        // A4: raiders arriving together from 140 km measurably damage the shared target within
        // 10 sim-minutes, instead of detonating on each other before ever reaching it.
        expect(armorHealthSum(targetState)).to.be.lessThan(initialArmor);
    });

    it('anchors the fuze to the real attack-order distance when the weapons-lock target does not resolve', () => {
        // weaponsTarget (and shellRangeMode) resolve off player-facing visibility/radar range — an
        // unrelated concern for an NPC's own gunnery against its attack order. Put the target beyond
        // every radar sector's range so weaponsTarget definitely stays unresolved (shellRangeMode
        // stays DIRECT), while still well within the gun's own maxShellRange-clamped engagement.
        const spaceMgr = new SpaceManager();
        const die = new MockDie();
        die.expectedRoll = 1;

        const targetDistance = 50_000; // beyond every dragonfly-MK1 radar sector's range
        const attacker = new Spaceship().init(
            'attacker',
            Vec2.make(XY.byLengthAndDirection(targetDistance, 0)),
            'dragonfly-MK1',
            Faction.Raiders,
        );
        const attackerState = makeShipState(attacker.id, shipConfigurations['dragonfly-MK1']);
        attackerState.isPlayerShip = false;
        const attackerMgr = new ShipManagerNpc(attacker, attackerState, spaceMgr, die);

        const target = new Spaceship().init('target', Vec2.make(XY.zero), 'large-station', Faction.Gravitas);
        spaceMgr.insert(attacker);
        spaceMgr.insert(target);
        spaceMgr.forceFlushEntities();

        attackerMgr.state.order = Order.ATTACK;
        attackerMgr.state.orderTargetId = target.id;

        const iterations = makeIterationsData(0.05, 1);
        for (const id of iterations) {
            attackerMgr.update(id);
            spaceMgr.update(id);
        }

        const gun = attackerMgr.state.chainGuns[0];
        expect(gun.shellRangeMode, 'target is out of every radar sector range').to.equal(SmartPilotMode.DIRECT);
        const explosionDistance = gun.shellSecondsToLive * gun.design.bulletSpeed;
        // the order target is 50km out but the gun only reaches maxShellRange (4500m) — the fuze
        // should aim for that clamped ceiling, not the gun's min/max midpoint (2500m) DIRECT mode
        // otherwise falls back to regardless of how far away the real order target actually is.
        expect(explosionDistance).to.be.greaterThan(gun.design.maxShellRange * 0.9);
    });
});

describe('resetShipState clears orders', () => {
    it('clears order fields and currentTask', () => {
        const state = makeShipState('test', demoShipConfig);

        state.order = Order.ATTACK;
        state.orderTargetId = 'target-1';
        state.orderPosition.x = 100;
        state.orderPosition.y = 200;
        state.currentTask = 'Attack target-1';

        resetShipState(state);

        expect(state.order).to.equal(Order.NONE);
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(state.orderTargetId).to.be.null;
        expect(state.orderPosition.x).to.equal(0);
        expect(state.orderPosition.y).to.equal(0);
        expect(state.currentTask).to.equal('');
    });
});

describe('NPC to PC conversion clears stale currentTask', () => {
    it('PC ship constructed from NPC state has empty currentTask', () => {
        // Simulate NPC state: order and currentTask set during NPC execution
        const spaceMgr = new SpaceManager();
        const shipObj = new Spaceship();
        shipObj.id = '1';
        const die = new MockDie();
        die.expectedRoll = 1;
        spaceMgr.insert(shipObj);

        // Build an NPC state with stale task info (as would exist during NPC→PC conversion)
        const npcState = makeShipState(shipObj.id, demoShipConfig);
        npcState.order = Order.MOVE;
        npcState.orderPosition.x = 5000;
        npcState.orderPosition.y = 2000;
        npcState.currentTask = 'Go to 5000,2000';

        // Simulate convertShipType: clone state, then create PC manager
        const clonedState = npcState.clone();
        // After clone, stale currentTask should survive until resetShipState is called
        // Creating ShipManagerPc calls resetShipState in its constructor
        const pcMgr = new ShipManagerPc(shipObj, clonedState, spaceMgr, die);

        expect(pcMgr.state.currentTask).to.equal('');
    });

    it('clears smartPilot automation state', () => {
        const state = makeShipState('test', demoShipConfig);

        state.smartPilot.maneuvering.x = 0.8;
        state.smartPilot.maneuvering.y = -0.5;
        state.smartPilot.rotation = 0.7;
        state.smartPilot.rotationTargetOffset = 0.3;
        state.smartPilot.maneuveringMode = SmartPilotMode.TARGET;
        state.smartPilot.rotationMode = SmartPilotMode.TARGET;
        state.currentTask = 'Go to 1000,2000';

        resetShipState(state);

        expect(state.smartPilot.maneuvering.x).to.equal(0);
        expect(state.smartPilot.maneuvering.y).to.equal(0);
        expect(state.smartPilot.rotation).to.equal(0);
        expect(state.smartPilot.rotationTargetOffset).to.equal(0);
        expect(state.smartPilot.maneuveringMode).to.equal(SmartPilotMode.DIRECT);
        expect(state.smartPilot.rotationMode).to.equal(SmartPilotMode.DIRECT);
        expect(state.currentTask).to.equal('');
    });
});

describe('NPC to PC conversion', () => {
    it('cancelAllTasks clears NPC automation state before conversion', () => {
        const { shipMgr } = createShipSetup(ShipManagerNpc);

        shipMgr.state.order = Order.MOVE;
        shipMgr.state.orderPosition.x = 1000;
        shipMgr.state.orderPosition.y = 2000;
        shipMgr.state.smartPilot.maneuvering.x = 0.8;
        shipMgr.state.smartPilot.maneuvering.y = -0.3;
        shipMgr.state.smartPilot.rotation = 0.6;
        // currentTask must be non-empty for AutomationManager.cleanup() to fire;
        // resetShipState() (called in the PC constructor) is the unconditional backstop.
        shipMgr.state.currentTask = 'Go to 1000,2000';

        shipMgr.cancelAllTasks();

        expect(shipMgr.state.smartPilot.maneuvering.x).to.equal(0);
        expect(shipMgr.state.smartPilot.maneuvering.y).to.equal(0);
        expect(shipMgr.state.smartPilot.rotation).to.equal(0);
        expect(shipMgr.state.currentTask).to.equal('');
    });

    it('PC ship created from NPC state starts with clean controls', () => {
        const { spaceMgr, shipObj, shipMgr: npcMgr } = createShipSetup(ShipManagerNpc);

        npcMgr.state.order = Order.MOVE;
        npcMgr.state.orderPosition.x = 5000;
        npcMgr.state.orderPosition.y = 5000;

        const iterations = makeIterationsData(0.05, 5);
        for (const id of iterations) {
            npcMgr.update(id);
            spaceMgr.update(id);
        }

        expect(npcMgr.state.smartPilot.maneuvering.x).to.not.equal(0);

        npcMgr.cancelAllTasks();

        const freshState = npcMgr.state.clone();
        const die = new MockDie();
        die.expectedRoll = 1;
        const pcMgr = new ShipManagerPc(shipObj, freshState, spaceMgr, die);

        expect(pcMgr.state.order).to.equal(Order.NONE);
        expect(pcMgr.state.smartPilot.maneuvering.x).to.equal(0);
        expect(pcMgr.state.smartPilot.maneuvering.y).to.equal(0);
        expect(pcMgr.state.smartPilot.rotation).to.equal(0);
        expect(pcMgr.state.currentTask).to.equal('');
        expect(pcMgr.state.smartPilot.maneuveringMode).to.equal(SmartPilotMode.VELOCITY);
    });

    it('PC ship after conversion responds to pilot maneuvering input', () => {
        const { spaceMgr, shipObj, shipMgr: npcMgr } = createShipSetup(ShipManagerNpc);

        npcMgr.state.order = Order.MOVE;
        npcMgr.state.orderPosition.x = 5000;
        npcMgr.state.orderPosition.y = 5000;

        const npcIterations = makeIterationsData(0.05, 5);
        for (const id of npcIterations) {
            npcMgr.update(id);
            spaceMgr.update(id);
        }

        npcMgr.cancelAllTasks();

        const freshState = npcMgr.state.clone();
        const die = new MockDie();
        die.expectedRoll = 1;
        const pcMgr = new ShipManagerPc(shipObj, freshState, spaceMgr, die);

        pcMgr.state.smartPilot.maneuvering.x = 1;
        const velocityBefore = XY.clone(shipObj.velocity);

        const pcIterations = makeIterationsData(0.05, 20);
        for (const id of pcIterations) {
            pcMgr.update(id);
            spaceMgr.update(id);
        }

        const velocityAfter = shipObj.velocity;
        expect(XY.lengthOf(XY.difference(velocityAfter, velocityBefore))).to.be.greaterThan(0);
    });

    it('PC ship after conversion does not drain all energy at idle', () => {
        const { spaceMgr, shipObj, shipMgr: npcMgr } = createShipSetup(ShipManagerNpc);

        npcMgr.cancelAllTasks();

        const freshState = npcMgr.state.clone();
        const die = new MockDie();
        die.expectedRoll = 1;
        const pcMgr = new ShipManagerPc(shipObj, freshState, spaceMgr, die);

        const initialEnergy = pcMgr.state.reactor.energy;

        const iterations = makeIterationsData(0.05, 100);
        for (const id of iterations) {
            pcMgr.update(id);
            spaceMgr.update(id);
        }

        expect(pcMgr.state.reactor.energy).to.be.greaterThan(initialEnergy * 0.5);
    });
});
