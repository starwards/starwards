import { ChainGun, ShipState } from '../ship';
import { RTuple2, addScale } from './formulas';
import { SpaceObject, projectileDesigns } from '../space';

import { XY } from './xy';

/*
GPT suggester this:
export function predictHitLocation(ship: ShipState, chainGun: ChainGun, target: SpaceObject, targetAccel: XY): XY {
    const fireAngle = ship.angle + chainGun.angle;
    const bulletSpeed = chainGun.design.bulletSpeed;
    const bulletVelocity = XY.add(ship.velocity, XY.rotate({ x: bulletSpeed, y: 0 }, fireAngle));

    // Relative acceleration between target and bullet
    const relativeAccel = targetAccel; // Assuming bullet has no acceleration in this model

    // Initial relative position and velocity (target relative to ship + bullet initial velocity)
    const initialRelativePos = XY.difference(target.position, ship.position);
    const initialRelativeVel = XY.difference(target.velocity, bulletVelocity);

    // Solve quadratic equation Ax^2 + Bx + C = 0 for time t
    const A = 0.5 * XY.dot(relativeAccel, relativeAccel);
    const B = XY.dot(initialRelativeVel, relativeAccel);
    const C = XY.dot(initialRelativePos, initialRelativePos);

    // Discriminant
    const D = B*B - 4*A*C;

    if (D < 0) {
        // No real solution; use fallback or heuristic
        return target.position;
    }

    // Quadratic formula to find time; only considering positive root
    const t = (-B + Math.sqrt(D)) / (2 * A);

    // Predicted position of target at time t
    const predictedPosition = XY.equasionOfMotion(target.position, target.velocity, targetAccel, t);

    return predictedPosition;
}

*/
export function predictHitLocation(ship: ShipState, chainGun: ChainGun, target: SpaceObject) {
    const maxIterations = 20;
    const maxSeconds = 100;
    const fireAngle = ship.angle + chainGun.angle;
    const fireVelocity = Math.max(
        XY.lengthOf(XY.add(ship.velocity, XY.rotate({ x: chainGun.design.bulletSpeed, y: 0 }, fireAngle))),
        1,
    );
    let time = 0;
    let predictedPosition: XY = target.position;
    // this loop refines the time it will take for a bullet to reach the target
    // and from that it estimates when the target will be at the time of impact
    for (let i = 0; i < maxIterations; i++) {
        const distance = Math.max(XY.lengthOf(XY.difference(predictedPosition, ship.position)), 1);
        if (!isFinite(distance) || !Number.isSafeInteger(Math.trunc(distance))) {
            break;
        }
        time = distance / fireVelocity;
        if (time > maxSeconds) {
            break;
        }
        const newTargetPos = XY.equasionOfMotion(target.position, target.velocity, XY.zero, time);
        if (!XY.isFinite(newTargetPos)) {
            break;
        }
        predictedPosition = newTargetPos;
    }
    return predictedPosition;
}

export function calcRangediff(ship: ShipState, target: SpaceObject, predictedPosition: XY) {
    // calc projection of position delta on axis from ship to target
    const direction = ship.directionAxis;
    const posDelta = XY.difference(predictedPosition, target.position);
    const posDeltaOnDirection = XY.projection(posDelta, direction);
    return XY.div(posDeltaOnDirection, direction);
}

export function getKillZoneRadiusRange(chainGun: ChainGun): RTuple2 {
    const shellExplosionDistance = chainGun.shellSecondsToLive * chainGun.design.bulletSpeed;
    if (chainGun.projectile === 'None') {
        return [0, 1_000_000];
    }
    const { secondsToLive, expansionSpeed } = projectileDesigns[chainGun.projectile].explosion;
    const explosionRadius = secondsToLive * expansionSpeed;
    return [shellExplosionDistance - 3.0 * explosionRadius, shellExplosionDistance + 3.0 * explosionRadius];
}

export function isTargetInKillZone(ship: ShipState, chainGun: ChainGun, target: SpaceObject) {
    const shellHitLocation = getShellExplosionLocation(ship, chainGun);
    const targetLocationAtShellExplosion = getTargetLocationAtShellExplosion(chainGun, target);
    const shellDangerZoneRadius = getShellDangerZoneRadius(chainGun);
    const aimingDistanceToTarget = XY.lengthOf(XY.difference(shellHitLocation, targetLocationAtShellExplosion));
    return aimingDistanceToTarget < shellDangerZoneRadius;
}

export function calcShellSecondsToLive(ship: ShipState, chainGun: ChainGun, distance: number) {
    const fireAngle = ship.angle + chainGun.angle;
    const fireVelocity = XY.add(ship.velocity, XY.rotate({ x: chainGun.design.bulletSpeed, y: 0 }, fireAngle));
    return distance / XY.lengthOf(fireVelocity);
}

export function getShellAimVelocityCompensation(ship: ShipState, chainGun: ChainGun): XY {
    return XY.negate(XY.scale(ship.velocity, chainGun.shellSecondsToLive));
}

export function getShellExplosionLocation(ship: ShipState, chainGun: ChainGun): XY {
    const fireAngle = ship.angle + chainGun.angle;
    const fireSource = XY.add(ship.position, XY.rotate({ x: ship.radius, y: 0 }, fireAngle));
    const fireVelocity = XY.add(ship.velocity, XY.rotate({ x: chainGun.design.bulletSpeed, y: 0 }, fireAngle));
    const fireTime = chainGun.shellSecondsToLive;
    return XY.add(fireSource, XY.scale(fireVelocity, fireTime));
}

function getShellDangerZoneRadius(chainGun: ChainGun): number {
    if (chainGun.projectile === 'None') {
        return 0;
    }
    const { secondsToLive, expansionSpeed } = projectileDesigns[chainGun.projectile].explosion;
    const explosionRadius = secondsToLive * expansionSpeed;
    const shellExplosionDistance = chainGun.shellSecondsToLive * chainGun.design.bulletSpeed;
    const spreadDegrees = 3.0 * chainGun.design.bulletDegreesDeviation;
    const spread = Math.sin(spreadDegrees) * shellExplosionDistance;
    return spread + explosionRadius;
}

export function getTargetLocationAtShellExplosion(chainGun: ChainGun, target: SpaceObject) {
    const fireTime = chainGun.shellSecondsToLive;
    return addScale(target.position, target.velocity, fireTime);
}
