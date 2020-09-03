import { ShipState } from '../ship';
import { SpaceObject, XY } from '../space';
import { capToMagnitude } from './formulas';

export type ManeuveringCommand = { strafe: number; boost: number };

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

export function matchTargetDirection(_deltaSeconds: number, ship: ShipState, targetObj: SpaceObject): number {
    const targetAngle = XY.angleOf(XY.difference(targetObj.position, ship.position)) % 360;
    let angleDelta = ((360 + 180 + targetAngle - ship.angle) % 360) - 180;
    if (Math.abs(angleDelta) < conf.noiseThreshold) {
        return 0;
    } else {
        if (Math.abs(angleDelta) < conf.minRotation) {
            angleDelta = angleDelta < 0 ? -conf.minRotation : conf.minRotation;
        }
        return (conf.reactionFactor * angleDelta) / ship.rotationEffectFactor;
    }
}
