import { EPSILON, capToRange, equasionOfMotion, lerp, sign, toDegreesDelta, whereWillItStop } from './formulas';
import { ShipDirection, vector2ShipDirections } from '../ship/ship-direction';

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
    const velocityDirection = vector2ShipDirections(posDiff);
    return {
        strafe: accelerateToPosition(deltaSeconds, ship.velocityCapacity(velocityDirection.y), velocity.y, posDiff.y),
        boost: accelerateToPosition(deltaSeconds, ship.velocityCapacity(velocityDirection.x), velocity.x, posDiff.x),
    };
}

/**
 * Classic pursuit-intercept solution: given a target moving at (approximately) constant
 * velocity and an interceptor capable of `interceptorSpeed`, returns the point where a
 * straight-line course at that speed meets the target's projected path -- so a guidance
 * loop can steer at where the target will be instead of chasing where it is now. Falls
 * back to the target's current position when no real solution exists (interceptor too
 * slow to ever catch up).
 */
export function predictInterceptPoint(
    interceptorPosition: XY,
    interceptorSpeed: number,
    target: { position: XY; velocity: XY },
): XY {
    const toTarget = XY.difference(target.position, interceptorPosition);
    const a = XY.dot(target.velocity, target.velocity) - interceptorSpeed * interceptorSpeed;
    const b = 2 * XY.dot(toTarget, target.velocity);
    const c = XY.dot(toTarget, toTarget);

    let t: number | null = null;
    if (Math.abs(a) < EPSILON) {
        if (Math.abs(b) > EPSILON) {
            const candidate = -c / b;
            if (candidate > 0) {
                t = candidate;
            }
        }
    } else {
        const discriminant = b * b - 4 * a * c;
        if (discriminant >= 0) {
            const sqrtD = Math.sqrt(discriminant);
            const candidates = [(-b + sqrtD) / (2 * a), (-b - sqrtD) / (2 * a)].filter((x) => x > 0);
            if (candidates.length) {
                t = Math.min(...candidates);
            }
        }
    }
    return t === null ? target.position : XY.equasionOfMotion(target.position, target.velocity, XY.zero, t);
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

/**
 * Rotation command that holds `absoluteAngle` — {@link rotateToTarget} against a heading rather than
 * a point, plus the term that tracks a *moving* one. `referenceTurnSpeed` is how fast that heading
 * itself sweeps (deg/s); damping against absolute turn rate instead leaves a standing lag
 * proportional to the sweep — the whole pass long, for a target crossing abeam.
 */
export function rotateToAngle(deltaSeconds: number, ship: Craft, absoluteAngle: number, referenceTurnSpeed = 0) {
    return accelerateToPosition(
        deltaSeconds,
        ship.rotationCapacity,
        ship.turnSpeed - referenceTurnSpeed,
        toDegreesDelta(absoluteAngle - ship.angle),
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
    if (maxAccelerationInIteration === 0) {
        // no acceleration budget this tick (paused, or a fully broken thruster) — every
        // distance/velocity ratio below divides by this, so bail out with no command
        // rather than feed a same-magnitude 0/0 into lerp()
        return 0;
    }
    const pinPointDistance = equasionOfMotion(0, 0, maxAccelerationInIteration, pinpointIterationsPredict); // always positive
    const pinPointVelocity = maxAccelerationInIteration * pinpointIterationsPredict; // always positive

    const signVelocity = sign(velocity);
    const signRelTarget = sign(relTargetPosition);
    const absVelocity = Math.abs(velocity);
    const targetDistance = Math.abs(relTargetPosition);

    if (absVelocity < pinPointVelocity * 0.5) {
        const stopDistance = whereWillItStop(0, absVelocity, -capacity);
        const controlDistance = Math.max(stopDistance * 2, pinPointDistance);
        if (targetDistance < controlDistance) {
            const positionControl = (targetDistance / controlDistance) * signRelTarget;
            const velocityDamping = velocity / pinPointVelocity;
            return capToRange(-1, 1, positionControl - velocityDamping);
        }
    }

    if (signVelocity !== signRelTarget) {
        return signRelTarget;
    }

    const maxBreakDistance = whereWillItStop(0, absVelocity + pinPointVelocity, -capacity) + pinPointDistance;
    const minBreakDistance = Math.max(
        0,
        whereWillItStop(0, absVelocity - pinPointVelocity, -capacity) - pinPointDistance,
    );

    const result =
        capToRange(-1, 1, lerp([minBreakDistance, maxBreakDistance], [-1, 1], targetDistance)) * signRelTarget;
    return result;
}

// result is normalized [-1, 1]
function accelerateToSpeed(deltaSeconds: number, capacity: number, relTargetSpeed: number) {
    const maxAccelerationInTime = deltaSeconds * capacity * 1.001;
    if (maxAccelerationInTime === 0) {
        // no acceleration budget this tick (paused, or a fully broken thruster) — lerp() below
        // would divide by this same zero-width range
        return 0;
    }
    const res = capToRange(-1, 1, lerp([-maxAccelerationInTime, maxAccelerationInTime], [-1, 1], relTargetSpeed));
    return res * res * sign(res);
}
