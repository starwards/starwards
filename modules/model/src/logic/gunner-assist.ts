import { ShipState } from '../ship';
import { SpaceObject, XY } from '../space';

export function getShellExplosionLocation(ship: ShipState): XY {
    const fireAngle = ship.angle + ship.chainGun.angle;
    const fireSource = XY.add(ship.position, XY.rotate({ x: ship.radius, y: 0 }, fireAngle));
    const fireVelocity = XY.rotate({ x: ship.chainGun.bulletSpeed, y: 0 }, fireAngle);
    const fireTime = ship.chainGun.shellSecondsToLive;
    return XY.add(fireSource, XY.scale(fireVelocity, fireTime));
}

export function getShellDangerZoneRadius(ship: ShipState): number {
    const explosionRadius = ship.chainGun.explosionSecondsToLive * ship.chainGun.explosionExpansionSpeed;
    const shellExplosionDistance = ship.chainGun.shellSecondsToLive * ship.chainGun.bulletSpeed;
    const spreadDegrees = 3.0 * ship.chainGun.bulletDegreesDeviation;
    const spread = Math.sin(spreadDegrees) * shellExplosionDistance;
    return spread + explosionRadius;
}

export function getTargetLocationAtShellExplosion(ship: ShipState, target: SpaceObject) {
    const fireTime = ship.chainGun.shellSecondsToLive;
    return XY.add(target.position, XY.scale(XY.difference(target.velocity, ship.velocity), fireTime));
}
