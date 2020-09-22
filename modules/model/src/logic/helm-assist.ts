import { ShipState } from '../ship';
import { SpaceObject } from '../space';
import { capToMagnitude, capToRange, lerp, negSign, sign, toDegreesDelta, whereWillItStop } from './formulas';
import { XY } from './xy';

export type ManeuveringCommand = { strafe: number; boost: number };

const conf = {
    noiseThreshold: 0.01,
    minRotation: 1.5,
    changeFactor: 2, // has to be > 1
    reactionFactor: 1, //  > 1 means over-reaction
};

export function rotationFromTargetTurnSpeed(currentTurnSpeed: number, targetTurnSpeed: number) {
    const turnDiffRange = 100;
    const maxSharpness = 6;
    const turnSpeedDiff = capToRange(-turnDiffRange, turnDiffRange, targetTurnSpeed - currentTurnSpeed);
    if (turnSpeedDiff) {
        // use two lineras to calc a form of (turnSpeedDiff/turnDiffRange)^2
        const convexity = lerp([0, turnDiffRange], [1, maxSharpness], Math.abs(turnSpeedDiff));
        return capToRange(-1, 1, lerp([-turnDiffRange, turnDiffRange], [-convexity, convexity], turnSpeedDiff));
    } else {
        return 0;
    }
}

export function moveToTarget(deltaSeconds: number, ship: ShipState, targetPos: XY, scale: number): ManeuveringCommand {
    const posDiff = XY.rotate(XY.difference(targetPos, ship.position), -ship.angle);
    const desiredSpeed = XY.scale(XY.normalize(posDiff), scale);
    if (XY.lengthOf(desiredSpeed) < conf.noiseThreshold) {
        return { strafe: 0, boost: 0 };
    } else {
        const desiredManeuvering = XY.scale(desiredSpeed, deltaSeconds * conf.reactionFactor);
        return {
            strafe: capToMagnitude(ship.strafe, conf.changeFactor, desiredManeuvering.y / ship.strafeEffectFactor),
            boost: capToMagnitude(ship.boost, conf.changeFactor, desiredManeuvering.x / ship.boostEffectFactor),
        };
    }
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
    const maxTurnAcceleration = calcMaxTurnAcceleration(ship);
    const turnSpeed = ship.turnSpeed;
    if (Math.abs(angleDelta) < conf.noiseThreshold) {
        return 0;
    } else if (sign(angleDelta) !== sign(turnSpeed)) {
        // use two lineras to calc a form of (turnSpeedDiff/180)^2
        const sharpness = lerp([0, 180], [1, 50], Math.abs(angleDelta));
        return capToRange(-1, 1, lerp([-180, 180], [-sharpness, sharpness], angleDelta));
        // return negSign(turnSpeed);
    } else {
        const stoppingPoint = toDegreesDelta(whereWillItStop(0, turnSpeed, maxTurnAcceleration * negSign(turnSpeed)));
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

export function calcMaxTurnAcceleration(ship: ShipState) {
    return ship.maneuveringCapacity * ship.rotationEffectFactor;
}
