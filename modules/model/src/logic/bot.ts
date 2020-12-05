import {
    calcShellSecondsToLive,
    getKillZoneRadiusRange,
    getShellAimVelocityCompensation,
    getTarget,
    isInRange,
    isTargetInKillZone,
    matchGlobalSpeed,
    moveToTarget,
    predictHitLocation,
    rotateToTarget,
    ShipManager,
    SmartPilotMode,
    SpaceState,
    XY,
} from '../';

export type Bot = (deltaSeconds: number, spaceState: SpaceState, shipManager: ShipManager) => void;

export function jouster(): Bot {
    let lastTargetVelocity = XY.zero;
    let deltaSeconds = 1 / 20;
    return (currDeltaSeconds: number, spaceState: SpaceState, shipManager: ShipManager) => {
        deltaSeconds = deltaSeconds * 0.8 + currDeltaSeconds * 0.2;
        shipManager.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
        shipManager.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
        const target = getTarget(shipManager.state, spaceState);
        if (target) {
            const ship = shipManager.state;
            const targetAccel = XY.scale(XY.difference(target.velocity, lastTargetVelocity), 1 / deltaSeconds);
            const hitLocation = predictHitLocation(shipManager.state, target, targetAccel);
            shipManager.setShellSecondsToLive(calcShellSecondsToLive(ship, hitLocation));
            const rotation = rotateToTarget(
                deltaSeconds,
                ship,
                XY.add(hitLocation, getShellAimVelocityCompensation(ship)),
                0
            );
            shipManager.setSmartPilotRotation(rotation);
            const shipToTarget = XY.difference(hitLocation, ship.position);
            const distanceToTarget = XY.lengthOf(shipToTarget);
            const killRadius = getKillZoneRadiusRange(ship);
            if (isInRange(killRadius[0], killRadius[1], distanceToTarget)) {
                // if close enough to target, tail it
                const maneuvering = matchGlobalSpeed(deltaSeconds, ship, target.velocity);
                shipManager.setSmartPilotBoost(maneuvering.boost);
                shipManager.setSmartPilotStrafe(maneuvering.strafe);
            } else {
                const maneuvering = moveToTarget(deltaSeconds, ship, hitLocation);
                // close distance to target
                if (distanceToTarget > killRadius[1]) {
                    shipManager.setSmartPilotBoost(maneuvering.boost);
                    shipManager.setSmartPilotStrafe(maneuvering.strafe);
                } else {
                    // distanceToTarget < killRadius[0]
                    shipManager.setSmartPilotBoost(-maneuvering.boost);
                    shipManager.setSmartPilotStrafe(-maneuvering.strafe);
                }
            }
            lastTargetVelocity = XY.clone(target.velocity);
            shipManager.chainGun(isTargetInKillZone(shipManager.state, target));
        } else {
            lastTargetVelocity = XY.zero;
            shipManager.chainGun(false);
        }
    };
}
