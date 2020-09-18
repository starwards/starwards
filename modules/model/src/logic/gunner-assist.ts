import { ShipState } from '../ship';
import { SpaceObject } from '../space';
import { addScale } from './formulas';
import { XY } from './xy';

export function predictHitLocation(ship: ShipState, target: SpaceObject, targetAccel: XY) {
    const maxIterations = 20;
    const maxSeconds = 100;
    const fireAngle = ship.angle + ship.chainGun.angle;
    const fireVelocity = Math.max(
        XY.lengthOf(XY.add(ship.velocity, XY.rotate({ x: ship.chainGun.bulletSpeed, y: 0 }, fireAngle))),
        1
    );
    let time = 0;
    let targetPos: XY = target.position;
    for (let i = 0; i < maxIterations; i++) {
        const distance = Math.max(XY.lengthOf(XY.difference(targetPos, ship.position)), 1);
        if (!isFinite(distance) || !Number.isSafeInteger(Math.trunc(distance))) {
            break;
        }
        time = distance / fireVelocity;
        if (time > maxSeconds) {
            break;
        }
        const newTargetPos = XY.equasionOfMotion(target.position, target.velocity, targetAccel, time);
        if (!XY.isFinite(newTargetPos)) {
            break;
        }
        targetPos = newTargetPos;
    }
    return targetPos;
}

export function getKillZoneRadius(ship: ShipState): [number, number] {
    const shellExplosionDistance = ship.chainGun.shellSecondsToLive * ship.chainGun.bulletSpeed;
    const explosionRadius = ship.chainGun.explosionSecondsToLive * ship.chainGun.explosionExpansionSpeed;
    return [shellExplosionDistance - 3.0 * explosionRadius, shellExplosionDistance + 3.0 * explosionRadius];
}

export function isTargetInKillZone(ship: ShipState, target: SpaceObject) {
    const shellHitLocation = getShellExplosionLocation(ship);
    const targetLocationAtShellExplosion = getTargetLocationAtShellExplosion(ship, target);
    const shellDangerZoneRadius = getShellDangerZoneRadius(ship);
    const aimingDistanceToTarget = XY.lengthOf(XY.difference(shellHitLocation, targetLocationAtShellExplosion));
    return aimingDistanceToTarget < shellDangerZoneRadius;
}

export function calcShellSecondsToLive(ship: ShipState, targetPos: XY) {
    const fireAngle = ship.angle + ship.chainGun.angle;
    const fireVelocity = XY.add(ship.velocity, XY.rotate({ x: ship.chainGun.bulletSpeed, y: 0 }, fireAngle));
    const distance = XY.lengthOf(XY.difference(targetPos, ship.position));
    return distance / XY.lengthOf(fireVelocity);
}

export function getShellAimVelocityCompensation(ship: ShipState): XY {
    return XY.negate(XY.scale(ship.velocity, ship.chainGun.shellSecondsToLive));
}
export function getShellExplosionLocation(ship: ShipState): XY {
    const fireAngle = ship.angle + ship.chainGun.angle;
    const fireSource = XY.add(ship.position, XY.rotate({ x: ship.radius, y: 0 }, fireAngle));
    const fireVelocity = XY.add(ship.velocity, XY.rotate({ x: ship.chainGun.bulletSpeed, y: 0 }, fireAngle));
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
    return addScale(target.position, target.velocity, fireTime);
}
