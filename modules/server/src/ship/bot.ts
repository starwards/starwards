import {
    calcShellSecondsToLive,
    getKillZoneRadius,
    getShellAimVelocityCompensation,
    getTarget,
    isInRange,
    isTargetInKillZone,
    matchTargetSpeed,
    moveToTarget,
    predictHitLocation,
    rotateToTarget,
    ShipManager,
    SpaceObject,
    SpaceState,
    XY,
} from '@starwards/model';

export type Bot = (spaceState: SpaceState, shipManager: ShipManager, deltaSeconds: number) => void;

function tailTarget(shipManager: ShipManager, target: SpaceObject, hitLocation: XY, deltaSeconds: number) {
    const ship = shipManager.state;
    shipManager.setShellSecondsToLive(calcShellSecondsToLive(ship, hitLocation));
    const rotation = rotateToTarget(deltaSeconds, ship, XY.add(hitLocation, getShellAimVelocityCompensation(ship)));
    shipManager.setRotation(rotation);
    const shipToTarget = XY.difference(hitLocation, ship.position);
    const distanceToTarget = XY.lengthOf(shipToTarget);
    const killRadius = getKillZoneRadius(ship);
    if (isInRange(killRadius[0], killRadius[1], distanceToTarget)) {
        // if close enough to target, tail it
        const maneuvering = matchTargetSpeed(deltaSeconds, ship, target);
        shipManager.setBoost(maneuvering.boost);
        shipManager.setStrafe(maneuvering.strafe);
    } else {
        const maneuvering = moveToTarget(deltaSeconds, ship, hitLocation);
        // close distance to target
        if (distanceToTarget > killRadius[1]) {
            shipManager.setBoost(maneuvering.boost);
            shipManager.setStrafe(maneuvering.strafe);
        } else {
            // distanceToTarget < killRadius[0]
            shipManager.setBoost(-maneuvering.boost);
            shipManager.setStrafe(-maneuvering.strafe);
        }
    }
}

export function terminator() {
    let lastTargetVelocity = XY.zero;
    return (spaceState: SpaceState, shipManager: ShipManager, deltaSeconds: number) => {
        const target = getTarget(shipManager.state, spaceState);
        if (target) {
            const ship = shipManager.state;
            const targetAccel = XY.scale(XY.difference(target.velocity, lastTargetVelocity), 1 / deltaSeconds);
            const hitLocation = predictHitLocation(ship, target, targetAccel);
            tailTarget(shipManager, target, hitLocation, deltaSeconds);
            lastTargetVelocity = XY.clone(target.velocity);
            shipManager.chainGun(isTargetInKillZone(shipManager.state, target));
        } else {
            lastTargetVelocity = XY.zero;
            shipManager.chainGun(false);
        }
    };
}
