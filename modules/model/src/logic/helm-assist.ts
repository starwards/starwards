import { ShipState } from '../ship';
import { SpaceObject } from '../space';
import {
    capToMagnitude,
    capToRange,
    isInRange,
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
export function moveToTarget(deltaSeconds: number, ship: ShipState, targetPos: XY, scale: number): ManeuveringCommand {
    const estimatedLocation = XY.add(XY.scale(ship.velocity, deltaSeconds), ship.position);
    const posDiff = XY.rotate(XY.difference(targetPos, estimatedLocation), -ship.angle); // TODO cap to range maxMovementInTime
    const velocity = XY.rotate(ship.velocity, -ship.angle); // TODO cap to range maxMovementInTime
    return {
        strafe: 0, //accelerateToTarget(deltaSeconds, ship.strafeCapacity, velocity.y, posDiff.y) * scale,
        boost: accelerateToTarget(deltaSeconds, ship.boostCapacity, velocity.x, posDiff.x) * scale,
    };
}

// result is normalized
function accelerateToTarget(deltaSeconds: number, capacity: number, velocity: number, targetDistance: number) {
    const maxAccelerationInTime = deltaSeconds * capacity;
    const maxMovementInTime = (deltaSeconds * maxAccelerationInTime) / 2; // from equasion of motion
    if (Math.abs(targetDistance) < maxMovementInTime) {
        // console.log('pin-point stopping');
        return lerp([-maxMovementInTime, maxMovementInTime], [-1, 1], targetDistance);
    }
    if (velocity) {
        const estimatedCruiseSpeed = velocity + maxAccelerationInTime * sign(targetDistance); // speed if going to cruise
        const cruiseStopDistance = whereWillItStop(0, estimatedCruiseSpeed, capacity * -sign(estimatedCruiseSpeed));
        const fromTo = [0, targetDistance].sort();
        if (!isInRange(fromTo[0], fromTo[1], cruiseStopDistance)) {
            // console.log('too fast! break');
            return -sign(velocity);
        }
    }
    // console.log('cruise');
    return sign(targetDistance);
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
