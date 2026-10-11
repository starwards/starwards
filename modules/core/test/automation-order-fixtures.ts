// shared ship setups for the automation-order*.spec.ts files (split so jest runs them in parallel)
import {
    ChaingunDesign,
    ShipDesign,
    ShipDirectionConfig,
    ShipManagerNpc,
    ShipManagerPc,
    SmartPilotMode,
    SpaceManager,
    Spaceship,
    ThrusterDesign,
    chaingunPlatformChaingun,
    demoShipThruster,
    makeShipState,
    shipConfigurations,
} from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';

export const demoShipConfig = shipConfigurations['demo-ship'];

export function createShipSetup(
    Ctor: typeof ShipManagerPc | typeof ShipManagerNpc,
    config: ShipDesign = demoShipConfig,
) {
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

export function narrowArcPlatformConfig(bearingLimit: number) {
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
export function rotatingNarrowArcPlatformConfig(bearingLimit: number) {
    const chainGuns: [ShipDirectionConfig, ChaingunDesign][] = [['FWD', { ...chaingunPlatformChaingun, bearingLimit }]];
    return { ...shipConfigurations['chaingun-platform'], chainGuns };
}

/** Three narrow-arc mounts covering distinct, non-overlapping sectors (FWD/STBD/AFT). */
export function threeMountNarrowArcConfig(bearingLimit: number) {
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
export function threeMountFullTraverseConfig() {
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
export function shortAndLongRangeConfig() {
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
export function shortAndLongRangeThrustedConfig() {
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
export function turretOnlyAsymmetricThrustConfig() {
    const chainGuns: [ShipDirectionConfig, ChaingunDesign][] = [['FWD', chaingunPlatformChaingun]];
    const thrusters: [ShipDirectionConfig, ThrusterDesign][] = [
        ['FWD', demoShipThruster],
        ['FWD', demoShipThruster],
        ['PORT', demoShipThruster],
        ['STBD', demoShipThruster],
    ];
    return { ...demoShipConfig, chainGuns, thrusters };
}

export function runOneTick(shipMgr: ShipManagerPc | ShipManagerNpc, spaceMgr: SpaceManager) {
    const iterations = makeIterationsData(1, 20);
    for (const id of iterations) {
        shipMgr.update(id);
        spaceMgr.update(id);
    }
}
