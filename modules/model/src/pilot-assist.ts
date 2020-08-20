import { capToMagnitude } from './formulas';
import { ShipState } from './ship';
import { SpaceState, XY } from './space';

export type ManeuveringCommand = { strafe: number; boost: number };
export class PilotAssist {
    private noiseThreshold = 0.5;
    private changeFactor = 2; // has to be > 1

    constructor(private spaceGetter: () => SpaceState, private shipGetter: () => ShipState) {}

    matchTargetSpeed(delta: number): ManeuveringCommand | undefined {
        const ship = this.shipGetter();
        if (ship.targetId) {
            const space = this.spaceGetter();
            const targetObj = space.get(ship.targetId);
            if (targetObj) {
                const speedDiff = XY.rotate(XY.difference(targetObj.velocity, ship.velocity), -ship.angle);
                if (XY.lengthOf(speedDiff) < this.noiseThreshold) {
                    return { strafe: 0, boost: 0 };
                } else {
                    return this.desiredSpeedToManeuvering(speedDiff, delta);
                }
            }
        }
        return undefined;
    }

    private desiredSpeedToManeuvering(speedDiff: XY, delta: number) {
        const ship = this.shipGetter();
        return {
            strafe: capToMagnitude(ship.strafe, this.changeFactor, delta * speedDiff.y),
            boost: capToMagnitude(ship.boost, this.changeFactor, delta * speedDiff.x),
        };
    }
}
