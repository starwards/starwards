import {
    ShipManager,
    SmartPilotMode,
    SpaceState,
    XY,
    calcRangediff,
    getKillZoneRadiusRange,
    getShellAimVelocityCompensation,
    getTarget,
    isInRange,
    isTargetInKillZone,
    lerp,
    matchGlobalSpeed,
    moveToTarget,
    shipProperties as p,
    predictHitLocation,
    rotateToTarget,
    setNumericProperty,
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
            const rangeDiff = calcRangediff(shipManager.state, target, hitLocation);
            const range = shipManager.state.chainGun.maxShellRange - shipManager.state.chainGun.minShellRange;
            setNumericProperty(shipManager, p.shellRange, lerp([-range / 2, range / 2], [-1, 1], rangeDiff), undefined);
            const rotation = rotateToTarget(
                deltaSeconds,
                ship,
                XY.add(hitLocation, getShellAimVelocityCompensation(ship)),
                0
            );
            setNumericProperty(shipManager, p.rotationCommand, rotation, undefined);
            const shipToTarget = XY.difference(hitLocation, ship.position);
            const distanceToTarget = XY.lengthOf(shipToTarget);
            const killRadius = getKillZoneRadiusRange(ship);
            if (isInRange(killRadius[0], killRadius[1], distanceToTarget)) {
                // if close enough to target, tail it
                const maneuvering = matchGlobalSpeed(deltaSeconds, ship, target.velocity);
                setNumericProperty(shipManager, p.boostCommand, maneuvering.boost, undefined);
                setNumericProperty(shipManager, p.strafeCommand, maneuvering.strafe, undefined);
            } else {
                const maneuvering = moveToTarget(deltaSeconds, ship, hitLocation);
                // close distance to target
                if (distanceToTarget > killRadius[1]) {
                    setNumericProperty(shipManager, p.boostCommand, maneuvering.boost, undefined);
                    setNumericProperty(shipManager, p.strafeCommand, maneuvering.strafe, undefined);
                } else {
                    // distanceToTarget < killRadius[0]
                    setNumericProperty(shipManager, p.boostCommand, -maneuvering.boost, undefined);
                    setNumericProperty(shipManager, p.strafeCommand, -maneuvering.strafe, undefined);
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
