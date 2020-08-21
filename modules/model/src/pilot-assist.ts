import { capToMagnitude } from './formulas';
import { ShipState } from './ship';
import { SpaceState, XY } from './space';

export type ManeuveringCommand = { strafe: number; boost: number };
export class PilotAssist {
    private readonly noiseThreshold = 0.01;
    private readonly minRotation = 1.5;
    private readonly changeFactor = 2; // has to be > 1
    private readonly reactionFactor = 1; //  > 1 means over-reaction

    constructor(private spaceGetter: () => SpaceState, private shipGetter: () => ShipState) {}

    matchTargetSpeed(deltaSeconds: number): ManeuveringCommand | undefined {
        const ship = this.shipGetter();
        if (ship.targetId) {
            const space = this.spaceGetter();
            const targetObj = space.get(ship.targetId);
            if (targetObj) {
                const speedDiff = XY.rotate(XY.difference(targetObj.velocity, ship.velocity), -ship.angle);
                if (XY.lengthOf(speedDiff) < this.noiseThreshold) {
                    return { strafe: 0, boost: 0 };
                } else {
                    const desiredManeuvering = XY.scale(speedDiff, deltaSeconds * this.reactionFactor);
                    return {
                        strafe: capToMagnitude(
                            ship.strafe,
                            this.changeFactor,
                            desiredManeuvering.y / ship.strafeEffectFactor
                        ),
                        boost: capToMagnitude(
                            ship.boost,
                            this.changeFactor,
                            desiredManeuvering.x / ship.boostEffectFactor
                        ),
                    };
                }
            }
        }
        return undefined;
    }

    matchTargetDirection(_deltaSeconds: number): number | undefined {
        const ship = this.shipGetter();
        if (ship.targetId) {
            const space = this.spaceGetter();
            const targetObj = space.get(ship.targetId);
            if (targetObj) {
                const targetAngle = XY.angleOf(XY.difference(targetObj.position, ship.position)) % 360;
                let angleDelta = ((360 + 180 + targetAngle - ship.angle) % 360) - 180;
                if (Math.abs(angleDelta) < this.noiseThreshold) {
                    return 0;
                } else {
                    if (Math.abs(angleDelta) < this.minRotation) {
                        angleDelta = angleDelta < 0 ? -this.minRotation : this.minRotation;
                    }
                    return (this.reactionFactor * angleDelta) / ship.rotationEffectFactor;
                }
            }
        }
        return undefined;
    }
}
