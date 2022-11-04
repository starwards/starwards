import { ShipDirection, vector2ShipDirections } from '../ship/ship-direction';
import { capToRange, lerp, sign, toDegreesDelta, whereWillItStop } from './formulas';

import { ShipState } from '../ship';
import { XY } from './xy';

export type Craft = {
    rotationCapacity: number;
    turnSpeed: number;
    angle: number;
    velocity: XY;
    position: XY;
    globalToLocal(global: XY): XY;
    velocityCapacity(direction: ShipDirection): number;
};
export type ManeuveringCommand = { strafe: number; boost: number };

export function rotationFromTargetTurnSpeed(deltaSeconds: number, ship: ShipState, targetTurnSpeed: number) {
    return accelerateToSpeed(deltaSeconds, ship.design.rotationCapacity, targetTurnSpeed - ship.turnSpeed);
}

export function matchGlobalSpeed(deltaSeconds: number, ship: ShipState, globalVelocity: XY): ManeuveringCommand {
    return matchLocalSpeed(deltaSeconds, ship, ship.globalToLocal(globalVelocity));
}

export function matchLocalSpeed(deltaSeconds: number, ship: ShipState, localVelocity: XY): ManeuveringCommand {
    const relTargetSpeed = XY.difference(localVelocity, ship.globalToLocal(ship.velocity));
    const velocityDirection = vector2ShipDirections(relTargetSpeed);
    return {
        strafe: accelerateToSpeed(deltaSeconds, ship.velocityCapacity(velocityDirection.y), relTargetSpeed.y),
        boost: accelerateToSpeed(deltaSeconds, ship.velocityCapacity(velocityDirection.x), relTargetSpeed.x),
    };
}

export function moveToTarget(deltaSeconds: number, ship: Craft, targetPos: XY): ManeuveringCommand {
    const posDiff = calcTargetPositionDiff(deltaSeconds, ship, targetPos); // TODO cap to range maxMovementInTime
    const velocity = ship.globalToLocal(ship.velocity); // TODO cap to range maxMovementInTime
    const velocityDirection = vector2ShipDirections(velocity);
    return {
        strafe: accelerateToPosition(deltaSeconds, ship.velocityCapacity(velocityDirection.y), velocity.y, posDiff.y),
        boost: accelerateToPosition(deltaSeconds, ship.velocityCapacity(velocityDirection.x), velocity.x, posDiff.x),
    };
}

export function rotateToTarget(deltaSeconds: number, ship: Craft, targetPos: XY, offset: number): number {
    const angleDiff = calcTargetAngleDiff(deltaSeconds, ship, targetPos);
    return accelerateToPosition(deltaSeconds, ship.rotationCapacity, ship.turnSpeed, angleDiff + offset);
}

function calcTargetPositionDiff(deltaSeconds: number, ship: Craft, targetPos: XY) {
    const estimatedLocation = XY.add(XY.scale(ship.velocity, deltaSeconds), ship.position);
    return XY.rotate(XY.difference(targetPos, estimatedLocation), -ship.angle); // TODO cap to range maxMovementInTime
}

function calcTargetAngleDiff(deltaSeconds: number, ship: Craft, targetPos: XY) {
    const estimatedLocation = XY.add(XY.scale(ship.velocity, deltaSeconds), ship.position);
    const estimatedAngle = ship.turnSpeed * deltaSeconds + ship.angle;
    const targetAngle = XY.angleOf(XY.difference(targetPos, estimatedLocation));
    return toDegreesDelta(targetAngle - estimatedAngle);
}

// result is normalized [-1, 1]
function accelerateToPosition(deltaSeconds: number, capacity: number, velocity: number, relTargetPosition: number) {
    const pinpointIterationsPredict = 10;
    // global.harness?.addToGraph('capacity', capacity);
    const targetDistance = Math.abs(relTargetPosition);
    // global.harness?.addToGraph('targetDistance', targetDistance);
    const absVelocity = Math.abs(velocity);
    // global.harness?.addToGraph('absVelocity', absVelocity);
    const signVelocity = sign(velocity);
    const maxAccelerationInTime = deltaSeconds * capacity;
    // global.harness?.addToGraph('maxAccelerationInTime', maxAccelerationInTime);
    const relStopPosition = whereWillItStop(0, velocity, capacity * -signVelocity);
    const stopDistance = Math.abs(relStopPosition);
    // global.harness?.addToGraph('stopDistance', stopDistance);
    const targetRelativeToStop = relTargetPosition - relStopPosition;
    // global.harness?.addToGraph('targetRelativeToStop', targetRelativeToStop);
    const signTargetRelativeToStop = sign(targetRelativeToStop);
    const maxMovementInTime = deltaSeconds * maxAccelerationInTime;
    const pinPointRange = maxMovementInTime * pinpointIterationsPredict;
    // global.harness?.addToGraph('pinPointRange', pinPointRange);
    const closeToStopPosition = stopDistance < pinPointRange;
    if (closeToStopPosition) {
        const distanceSoonToCover = deltaSeconds * absVelocity * pinpointIterationsPredict;
        // global.harness?.addToGraph('distanceSoonToCover', distanceSoonToCover);
        const soonReachTarget = targetDistance < distanceSoonToCover;
        if (soonReachTarget) {
            const f = 0.8;
            // global.harness?.annotateGraph('soft-break');
            return capToRange(-f, f, -relStopPosition); //lerp([-maxMovementInTime, maxMovementInTime], [-1, 1], -relStopPosition));
        }
        if (targetDistance < pinPointRange) {
            const f = 1.5;
            // global.harness?.annotateGraph('pin-point');
            return capToRange(-f, f, lerp([-pinPointRange, pinPointRange], [-f, f], relTargetPosition));
        }
    }
    if (
        maxAccelerationInTime < absVelocity &&
        signTargetRelativeToStop == signVelocity &&
        targetRelativeToStop < stopDistance
    ) {
        // global.harness?.annotateGraph('slow down');
        return signTargetRelativeToStop * capToRange(0, 1, (targetDistance - stopDistance) / targetDistance);
    }
    // global.harness?.annotateGraph('full-speed');
    return signTargetRelativeToStop;
}

// result is normalized [-1, 1]
function accelerateToSpeed(deltaSeconds: number, capacity: number, relTargetSpeed: number) {
    const maxAccelerationInTime = deltaSeconds * capacity * 1.001;
    const res = capToRange(-1, 1, lerp([-maxAccelerationInTime, maxAccelerationInTime], [-1, 1], relTargetSpeed));
    return res * res * sign(res);
}
