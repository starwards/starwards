import { ShipState } from '../ship';
import { capToRange, equasionOfMotion, lerp, sign, toDegreesDelta, whereWillItStop } from './formulas';
import { XY } from './xy';

export type ManeuveringCommand = { strafe: number; boost: number };

export function rotationFromTargetTurnSpeed(deltaSeconds: number, ship: ShipState, targetTurnSpeed: number) {
    return accelerateToSpeed(deltaSeconds, ship.rotationCapacity, targetTurnSpeed - ship.turnSpeed);
}

export function matchGlobalSpeed(
    deltaSeconds: number,
    ship: ShipState,
    globalVelocity: XY,
    _log?: (s: string) => unknown
): ManeuveringCommand {
    return matchLocalSpeed(deltaSeconds, ship, ship.globalToLocal(globalVelocity), _log);
}

export function matchLocalSpeed(
    deltaSeconds: number,
    ship: ShipState,
    localVelocity: XY,
    _log?: (s: string) => unknown
): ManeuveringCommand {
    const relTargetSpeed = XY.difference(localVelocity, ship.globalToLocal(ship.velocity));
    return {
        strafe: accelerateToSpeed(deltaSeconds, ship.strafeCapacity, relTargetSpeed.y),
        boost: accelerateToSpeed(deltaSeconds, ship.boostCapacity, relTargetSpeed.x),
    };
}

export function moveToTarget(
    deltaSeconds: number,
    ship: ShipState,
    targetPos: XY,
    log?: (s: string) => unknown
): ManeuveringCommand {
    const posDiff = calcTargetPositionDiff(deltaSeconds, ship, targetPos); // TODO cap to range maxMovementInTime
    const velocity = ship.globalToLocal(ship.velocity); // TODO cap to range maxMovementInTime
    return {
        strafe: accelerateToPosition(deltaSeconds, ship.strafeCapacity, velocity.y, posDiff.y),
        boost: accelerateToPosition(deltaSeconds, ship.boostCapacity, velocity.x, posDiff.x, log),
    };
}

export function rotateToTarget(
    deltaSeconds: number,
    ship: ShipState,
    targetPos: XY,
    offset: number,
    log?: (s: string) => unknown
): number {
    const angleDiff = calcTargetAngleDiff(deltaSeconds, ship, targetPos);
    return accelerateToPosition(deltaSeconds, ship.rotationCapacity, ship.turnSpeed, angleDiff + offset, log);
}

function calcTargetPositionDiff(deltaSeconds: number, ship: ShipState, targetPos: XY) {
    const estimatedLocation = XY.add(XY.scale(ship.velocity, deltaSeconds), ship.position);
    return XY.rotate(XY.difference(targetPos, estimatedLocation), -ship.angle); // TODO cap to range maxMovementInTime
}

function calcTargetAngleDiff(deltaSeconds: number, ship: ShipState, targetPos: XY) {
    const estimatedLocation = XY.add(XY.scale(ship.velocity, deltaSeconds), ship.position);
    const estimatedAngle = ship.turnSpeed * deltaSeconds + ship.angle;
    const targetAngle = XY.angleOf(XY.difference(targetPos, estimatedLocation));
    return toDegreesDelta(targetAngle - estimatedAngle);
}

// result is normalized [-1, 1]
function accelerateToPosition(
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
        const soonReachTarget = targetDistance < deltaSeconds * absVelocity * pinpointIterationsPredict;
        if (soonReachTarget) {
            const maxMovementInTime = deltaSeconds * maxAccelerationInTime;
            log && log('soft-break');
            return capToRange(-1, 1, lerp([-maxMovementInTime, maxMovementInTime], [-1, 1], -relStopPosition));
        }
        if (targetDistance < pinPointRange) {
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

// result is normalized [-1, 1]
function accelerateToSpeed(deltaSeconds: number, capacity: number, relTargetSpeed: number) {
    const maxAccelerationInTime = deltaSeconds * capacity;
    return capToRange(-1, 1, lerp([-maxAccelerationInTime, maxAccelerationInTime], [-1, 1], relTargetSpeed));
}
