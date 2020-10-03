import { ShipState } from '../ship';
import { SpaceObject } from '../space';
import {
    capToMagnitude,
    capToRange,
    equasionOfMotion,
    lerp,
    negSign,
    sign,
    toDegreesDelta,
    whereWillItStop,
} from './formulas';
import { XY } from './xy';

export type ManeuveringCommand = { strafe: number; boost: number };

const conf = {
    noiseThreshold: 0.01,
    minRotation: 1.5,
    changeFactor: 2, // has to be > 1
    reactionFactor: 1, //  > 1 means over-reaction
};

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

// TODO deprecate scale arg by normalizing all commands and using lerp for capacity limits in ship manager
export function moveToTarget(
    deltaSeconds: number,
    ship: ShipState,
    targetPos: XY,
    log?: (s: string) => unknown
): ManeuveringCommand {
    const estimatedLocation = XY.add(XY.scale(ship.velocity, deltaSeconds), ship.position);
    const posDiff = XY.rotate(XY.difference(targetPos, estimatedLocation), -ship.angle); // TODO cap to range maxMovementInTime
    const velocity = XY.rotate(ship.velocity, -ship.angle); // TODO cap to range maxMovementInTime
    return {
        strafe: accelerateToTarget(deltaSeconds, ship.strafeCapacity, velocity.y, posDiff.y),
        boost: accelerateToTarget(deltaSeconds, ship.boostCapacity, velocity.x, posDiff.x, log),
    };
}

// result is normalized
function accelerateToTarget(
    deltaSeconds: number,
    capacity: number,
    velocity: number,
    relTargetPosition: number,
    log?: (s: string) => unknown
) {
    const cautionFactor = 1.1;
    const pinpointIterationsPredict = 10;
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

/**
 * returns a desired rotation in range [-1, 1] depending on the target speed of the ship that is required in oprder to point to the target
 */
export function calcRotationForTargetDirection(ship: ShipState, targetPos: XY): number {
    const targetAngle = XY.angleOf(XY.difference(targetPos, ship.position)) % 360;
    const angleDelta = toDegreesDelta(targetAngle - ship.angle);
    const turnSpeed = ship.turnSpeed;
    if (Math.abs(angleDelta) < conf.noiseThreshold) {
        return 0;
    } else if (sign(angleDelta) !== sign(turnSpeed)) {
        // use two lineras to calc a form of (turnSpeedDiff/180)^2
        const sharpness = lerp([0, 180], [1, 50], Math.abs(angleDelta));
        return capToRange(-1, 1, lerp([-180, 180], [-sharpness, sharpness], angleDelta));
        // return negSign(turnSpeed);
    } else {
        const stoppingPoint = toDegreesDelta(whereWillItStop(0, turnSpeed, ship.rotationCapacity * negSign(turnSpeed)));
        const breakDistance = Math.abs(angleDelta) - Math.abs(stoppingPoint);
        if (breakDistance <= 0) {
            // overshoot, start breaking
            return negSign(turnSpeed) * lerp([0, 5], [conf.noiseThreshold, 1], capToRange(0, 5, -breakDistance));
        } else if (breakDistance < 5) {
            // overshoot, start breaking
            return sign(turnSpeed) * lerp([0, 45], [0, 1], capToRange(0, 45, breakDistance));
        } else {
            // const sharpness = lerp([0, 180], [1, 50], capToRange(0, 180, Math.abs(breakDistance)));
            // return sign(angleDelta) * capToRange(0, 1, lerp([0, 180], [0, sharpness], Math.abs(angleDelta)));
            // return sign(turnSpeed) * lerp([0, 5], [conf.noiseThreshold, 1], capToRange(0, 5, breakDistance));

            return sign(turnSpeed);
        }
    }
}
