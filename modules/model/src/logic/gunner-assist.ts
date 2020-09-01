import { ShipState } from '../ship';
import { SpaceObject, XY } from '../space';

export class GunnerAssist {
    constructor(private shipGetter: () => ShipState) {}

    getShellExplosionLocation(): XY {
        const ship = this.shipGetter();
        const fireAngle = ship.angle + ship.chainGun.angle;
        const fireSource = XY.add(ship.position, XY.rotate({ x: ship.radius, y: 0 }, fireAngle));
        const fireVelocity = XY.rotate({ x: ship.chainGun.bulletSpeed, y: 0 }, fireAngle);

        const fireTime = ship.chainGun.shellSecondsToLive;
        return XY.add(fireSource, XY.scale(fireVelocity, fireTime));
    }

    getTargetLocationAtShellExplosion(target: SpaceObject) {
        const ship = this.shipGetter();
        const fireTime = ship.chainGun.shellSecondsToLive;
        return XY.add(target.position, XY.scale(XY.difference(target.velocity, ship.velocity), fireTime));
    }
}
