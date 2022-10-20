import {
    ShipManager,
    SmartPilotMode,
    SpaceState,
    XY,
    calcRangediff,
    getKillZoneRadiusRange,
    getShellAimVelocityCompensation,
    isInRange,
    isTargetInKillZone,
    lerp,
    matchGlobalSpeed,
    moveToTarget,
    predictHitLocation,
    rotateToTarget,
} from '../';

// TODO: use ShipApi
export type Bot = (deltaSeconds: number, spaceState: SpaceState, shipManager: ShipManager) => void;

export function cleanupBot(shipManager: ShipManager) {
    shipManager.setSmartPilotManeuveringMode(SmartPilotMode.VELOCITY);
    shipManager.setSmartPilotRotationMode(SmartPilotMode.VELOCITY);
    shipManager.state.smartPilot.rotation = 0;
    shipManager.state.smartPilot.maneuvering.x = 0;
    shipManager.state.smartPilot.maneuvering.y = 0;
    shipManager.chainGun(false);
    shipManager.setTarget(null);
    shipManager.bot = null;
}

export function p2pGoto(destination: XY): Bot {
    let deltaSeconds = 1 / 20;
    return (currDeltaSeconds: number, _spaceState: SpaceState, shipManager: ShipManager) => {
        deltaSeconds = deltaSeconds * 0.8 + currDeltaSeconds * 0.2;
        const ship = shipManager.state;
        if (XY.equals(ship.position, destination, 1) && XY.isZero(ship.velocity, 1)) {
            cleanupBot(shipManager);
        } else {
            shipManager.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
            shipManager.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
            const rotation = rotateToTarget(deltaSeconds, ship, destination, 0);
            const maneuvering = moveToTarget(deltaSeconds, ship, destination);
            shipManager.state.smartPilot.rotation = rotation;
            shipManager.state.smartPilot.maneuvering.x = maneuvering.boost;
            shipManager.state.smartPilot.maneuvering.y = maneuvering.strafe;
        }
    };
}

export function jouster(targetId: string): Bot {
    let lastTargetVelocity = XY.zero;
    let deltaSeconds = 1 / 20;
    return (currDeltaSeconds: number, spaceState: SpaceState, shipManager: ShipManager) => {
        deltaSeconds = deltaSeconds * 0.8 + currDeltaSeconds * 0.2;
        shipManager.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
        shipManager.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
        const target = spaceState.get(targetId) || null;
        const ship = shipManager.state;
        if (target && !target.destroyed && ship.chainGun) {
            shipManager.setTarget(targetId);
            const targetAccel = XY.scale(XY.difference(target.velocity, lastTargetVelocity), 1 / deltaSeconds);
            const hitLocation = predictHitLocation(ship, ship.chainGun, target, targetAccel);
            const rangeDiff = calcRangediff(ship, target, hitLocation);
            const range = ship.chainGun.design.maxShellRange - ship.chainGun.design.minShellRange;
            ship.chainGun.shellRange = lerp([-range / 2, range / 2], [-1, 1], rangeDiff);
            const rotation = rotateToTarget(
                deltaSeconds,
                ship,
                XY.add(hitLocation, getShellAimVelocityCompensation(ship, ship.chainGun)),
                0
            );
            ship.smartPilot.rotation = rotation;
            const shipToTarget = XY.difference(hitLocation, ship.position);
            const distanceToTarget = XY.lengthOf(shipToTarget);
            const killRadius = getKillZoneRadiusRange(ship.chainGun);
            if (isInRange(killRadius[0], killRadius[1], distanceToTarget)) {
                // if close enough to target, tail it
                const maneuvering = matchGlobalSpeed(deltaSeconds, ship, target.velocity);

                ship.smartPilot.maneuvering.x = maneuvering.boost;
                ship.smartPilot.maneuvering.y = maneuvering.strafe;
            } else {
                const maneuvering = moveToTarget(deltaSeconds, ship, hitLocation);
                // close distance to target
                if (distanceToTarget > killRadius[1]) {
                    ship.smartPilot.maneuvering.x = maneuvering.boost;
                    ship.smartPilot.maneuvering.y = maneuvering.strafe;
                } else {
                    // distanceToTarget < killRadius[0]
                    ship.smartPilot.maneuvering.x = -maneuvering.boost;
                    ship.smartPilot.maneuvering.y = -maneuvering.strafe;
                }
            }
            lastTargetVelocity = XY.clone(target.velocity);
            shipManager.chainGun(isTargetInKillZone(ship, ship.chainGun, target));
        } else {
            cleanupBot(shipManager);
        }
    };
}
