import { ShipDirection, vector2ShipDirections } from '../ship/ship-direction';
import { capToRange, equasionOfMotion, lerp, sign, toDegreesDelta, whereWillItStop } from './formulas';

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
    return accelerateToSpeed(deltaSeconds, ship.maneuvering.design.rotationCapacity, targetTurnSpeed - ship.turnSpeed);
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
    const posDiff = ship.globalToLocal(XY.difference(targetPos, ship.position));
    const velocity = ship.globalToLocal(ship.velocity); // TODO cap to range maxMovementInTime
    const velocityDirection = vector2ShipDirections(velocity);
    return {
        strafe: accelerateToPosition(deltaSeconds, ship.velocityCapacity(velocityDirection.y), velocity.y, posDiff.y),
        boost: accelerateToPosition(deltaSeconds, ship.velocityCapacity(velocityDirection.x), velocity.x, posDiff.x),
    };
}

export function rotateToTarget(deltaSeconds: number, ship: Craft, targetPos: XY, offset: number): number {
    const angleDiff = calcTargetAngleDiff(deltaSeconds, ship, targetPos);
    return accelerateToPosition(
        deltaSeconds,
        ship.rotationCapacity,
        ship.turnSpeed,
        toDegreesDelta(angleDiff + offset),
    );
}

function calcTargetAngleDiff(_deltaSeconds: number, ship: Craft, targetPos: XY) {
    const estimatedLocation = ship.position;
    const estimatedAngle = ship.angle;
    const targetAngle = XY.angleOf(XY.difference(targetPos, estimatedLocation));
    return toDegreesDelta(targetAngle - estimatedAngle);
}

// result is normalized [-1, 1]
function accelerateToPosition(deltaSeconds: number, capacity: number, velocity: number, relTargetPosition: number) {
    const pinpointIterationsPredict = 2;
    const maxAccelerationInIteration = deltaSeconds * capacity;
    const pinPointDistance = equasionOfMotion(0, 0, maxAccelerationInIteration, pinpointIterationsPredict); // always positive
    const pinPointVelocity = maxAccelerationInIteration * pinpointIterationsPredict; // always positive

    const signVelocity = sign(velocity);
    const signRelTarget = sign(relTargetPosition);
    if (signVelocity !== signRelTarget) {
        return signRelTarget;
    }

    const absVelocity = Math.abs(velocity);
    const maxBreakDistance = whereWillItStop(0, absVelocity + pinPointVelocity, -capacity) + pinPointDistance;
    const minBreakDistance = Math.max(
        0,
        whereWillItStop(0, absVelocity - pinPointVelocity, -capacity) - pinPointDistance,
    );
    const targetDistance = Math.abs(relTargetPosition);

    const result =
        capToRange(-1, 1, lerp([minBreakDistance, maxBreakDistance], [-1, 1], targetDistance)) * signRelTarget;
    return result;
}

// result is normalized [-1, 1]
function accelerateToSpeed(deltaSeconds: number, capacity: number, relTargetSpeed: number) {
    const maxAccelerationInTime = deltaSeconds * capacity * 1.001;
    const res = capToRange(-1, 1, lerp([-maxAccelerationInTime, maxAccelerationInTime], [-1, 1], relTargetSpeed));
    return res * res * sign(res);
}
