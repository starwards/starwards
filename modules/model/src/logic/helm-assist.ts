import { ShipState } from '../ship';
import { SpaceObject } from '../space';
import { capToMagnitude, capToRange, equasionOfMotion, lerp, sign, toDegreesDelta, whereWillItStop } from './formulas';
import { XY } from './xy';

export type ManeuveringCommand = { strafe: number; boost: number };

export function rotationFromTargetTurnSpeed(ship: ShipState, targetTurnSpeed: number, deltaSeconds: number) {
    const maxTurnSpeedInTime = deltaSeconds * ship.rotationCapacity;
    const turnSpeedDiff = capToRange(-maxTurnSpeedInTime, maxTurnSpeedInTime, targetTurnSpeed - ship.turnSpeed);
    if (Math.abs(turnSpeedDiff) < ship.rotationCapacity / 2) {
        // TODO: generalize the " / 2" magic number
        return lerp([-maxTurnSpeedInTime, maxTurnSpeedInTime], [-1, 1], turnSpeedDiff);
    } else {
        return sign(turnSpeedDiff);
    }
}

export function moveToTarget(
    deltaSeconds: number,
    ship: ShipState,
    targetPos: XY,
    log?: (s: string) => unknown
): ManeuveringCommand {
    const posDiff = calcTargetPositionDiff(ship, deltaSeconds, targetPos); // TODO cap to range maxMovementInTime
    const velocity = ship.globalToLocal(ship.velocity); // TODO cap to range maxMovementInTime
    return {
        strafe: accelerateToTarget(deltaSeconds, ship.strafeCapacity, velocity.y, posDiff.y),
        boost: accelerateToTarget(deltaSeconds, ship.boostCapacity, velocity.x, posDiff.x, log),
    };
}

function calcTargetPositionDiff(ship: ShipState, deltaSeconds: number, targetPos: XY) {
    const estimatedLocation = XY.add(XY.scale(ship.velocity, deltaSeconds), ship.position);
    const posDiff = XY.rotate(XY.difference(targetPos, estimatedLocation), -ship.angle); // TODO cap to range maxMovementInTime
    return posDiff;
}

function calcTargetAngleDiff(ship: ShipState, deltaSeconds: number, targetPos: XY) {
    const estimatedLocation = XY.add(XY.scale(ship.velocity, deltaSeconds), ship.position);
    const estimatedAngle = ship.turnSpeed * deltaSeconds + ship.angle;
    const targetAngle = XY.angleOf(XY.difference(targetPos, estimatedLocation));
    const angleDiff = toDegreesDelta(targetAngle - estimatedAngle);
    return angleDiff;
}

export function rotateToTarget(
    deltaSeconds: number,
    ship: ShipState,
    targetPos: XY,
    log?: (s: string) => unknown
): number {
    const angleDiff = calcTargetAngleDiff(ship, deltaSeconds, targetPos);
    const rotation = accelerateToTarget(deltaSeconds, ship.rotationCapacity, ship.turnSpeed, angleDiff, log);
    return rotation;
}

// result is normalized [-1, 1]
function accelerateToTarget(
    deltaSeconds: number,
    capacity: number,
    velocity: number,
    relTargetPosition: number,
    log?: (s: string) => unknown
) {
    const cautionFactor = 1.1;
    const pinpointIterationsPredict = 5;
    const targetDistance = Math.abs(relTargetPosition);
    const absVelocity = Math.abs(velocity);
    const signVelocity = sign(velocity);
    const maxAccelerationInTime = deltaSeconds * capacity;
    const relStopPosition = whereWillItStop(0, velocity, capacity * -signVelocity);
    const stopDistance = Math.abs(relStopPosition);
    const pinPointRange = equasionOfMotion(0, 0, capacity, deltaSeconds * pinpointIterationsPredict);
    const closeToStopPosition = stopDistance < pinPointRange;
    if (closeToStopPosition) {
        const closeToTarget = targetDistance < pinPointRange;
        const soonReachTarget = targetDistance < deltaSeconds * absVelocity * pinpointIterationsPredict;
        if (soonReachTarget) {
            const maxMovementInTime = deltaSeconds * maxAccelerationInTime;
            log && log('soft-break');
            return capToRange(-1, 1, lerp([-maxMovementInTime, maxMovementInTime], [-1, 1], -relStopPosition));
        }
        if (closeToTarget) {
            log && log('pin-point');
            return capToRange(-0.5, 0.5, lerp([-pinPointRange, pinPointRange], [-0.5, 0.5], relTargetPosition));
        }
    }
    const highSpeed = maxAccelerationInTime < absVelocity;
    const goingTheWrongWay = velocity && signVelocity != sign(relTargetPosition);
    const overSpeeding = targetDistance < stopDistance * cautionFactor;
    if (highSpeed && (goingTheWrongWay || overSpeeding)) {
        log && log('break');
        return -signVelocity;
    }
    log && log('full-speed');
    return sign(relTargetPosition);
}

const conf = {
    noiseThreshold: 0.01,
    minRotation: 1.5,
    changeFactor: 2, // has to be > 1
    reactionFactor: 1, //  > 1 means over-reaction
};
export function matchTargetSpeed(deltaSeconds: number, ship: ShipState, targetObj: SpaceObject): ManeuveringCommand {
    const speedDiff = XY.rotate(XY.difference(targetObj.velocity, ship.velocity), -ship.angle);
    if (XY.lengthOf(speedDiff) < conf.noiseThreshold) {
        return { strafe: 0, boost: 0 };
    } else {
        const desiredManeuvering = XY.scale(speedDiff, deltaSeconds * conf.reactionFactor);
        return {
            strafe: capToMagnitude(ship.strafe, conf.changeFactor, desiredManeuvering.y / ship.strafeEffectFactor),
            boost: capToMagnitude(ship.boost, conf.changeFactor, desiredManeuvering.x / ship.boostEffectFactor),
        };
    }
}
