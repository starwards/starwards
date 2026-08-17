import { ChainGun, ShipState } from '../ship';
import { RTuple2, addScale, degToRad } from './formulas';
import { SpaceObject, ammoDesigns, blastRadius } from '../space';

import { XY } from './xy';

const MAX_INTERCEPT_SECONDS = 100;
/** Below this `a` the quadratic is linear. Relative to `bulletSpeed²`, the scale `a` is measured on. */
const INTERCEPT_DEGENERATE_EPSILON = 1e-6;

/** Where a mount must point, and for how long its shell must live, to hit a target. */
export type ShellIntercept = {
    /** Time of flight, and therefore the fuze setting that detonates the shell on the target. */
    secondsToLive: number;
    /** Point to lay the mount's firing line on. Carries both target motion and inherited hull velocity. */
    aimPoint: XY;
    /**
     * False when the target's velocity relative to the firing ship meets or exceeds muzzle speed
     * along the line of sight. The other fields then degrade to the target's present position — a
     * mount still tracks it and the hull can still turn toward it, but nothing may commit the shot.
     */
    reachable: boolean;
};

/**
 * Solves the shell intercept for `chainGun` against `target`, in the firing ship's own frame.
 * @see docs/SUBSYSTEMS.md#shell-intercept-and-fuze-geometry
 */
export function solveShellIntercept(ship: ShipState, chainGun: ChainGun, target: SpaceObject): ShellIntercept {
    const bulletSpeed = Math.max(chainGun.design.bulletSpeed, 1);
    const shipToTarget = XY.difference(target.position, ship.position);
    const relativeVelocity = XY.difference(target.velocity, ship.velocity);
    // |shipToTarget + w·T| = radius + bulletSpeed·T  =>  a·T² + b·T + c = 0
    const a = XY.dot(relativeVelocity, relativeVelocity) - bulletSpeed * bulletSpeed;
    const b = 2 * XY.dot(shipToTarget, relativeVelocity) - 2 * ship.radius * bulletSpeed;
    const c = XY.dot(shipToTarget, shipToTarget) - ship.radius * ship.radius;
    const secondsToLive = smallestPositiveRoot(a, b, c, INTERCEPT_DEGENERATE_EPSILON * bulletSpeed * bulletSpeed);
    if (secondsToLive === null || secondsToLive > MAX_INTERCEPT_SECONDS) {
        return {
            secondsToLive: Math.max(0, XY.lengthOf(shipToTarget) - ship.radius) / bulletSpeed,
            aimPoint: target.position,
            reachable: false,
        };
    }
    const aimPoint = addScale(target.position, relativeVelocity, secondsToLive);
    return XY.isFinite(aimPoint)
        ? { secondsToLive, aimPoint, reachable: true }
        : { secondsToLive, aimPoint: target.position, reachable: false };
}

function smallestPositiveRoot(a: number, b: number, c: number, degenerateBound: number): number | null {
    if (Math.abs(a) < degenerateBound) {
        const linear = -c / b;
        return isFinite(linear) && linear > 0 ? linear : null;
    }
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) {
        return null;
    }
    const sqrt = Math.sqrt(discriminant);
    const roots = [(-b - sqrt) / (2 * a), (-b + sqrt) / (2 * a)].filter((r) => isFinite(r) && r > 0);
    return roots.length ? Math.min(...roots) : null;
}

export function getKillZoneRadiusRange(chainGun: ChainGun): RTuple2 {
    const shellExplosionDistance = chainGun.shellSecondsToLive * chainGun.design.bulletSpeed;
    if (chainGun.projectile === 'None') {
        return [0, 1_000_000];
    }
    const explosionRadius = blastRadius(ammoDesigns[chainGun.projectile]);
    return [shellExplosionDistance - 3.0 * explosionRadius, shellExplosionDistance + 3.0 * explosionRadius];
}

export function isTargetInKillZone(ship: ShipState, chainGun: ChainGun, target: SpaceObject) {
    const shellHitLocation = getShellExplosionLocation(ship, chainGun);
    const targetLocationAtShellExplosion = getTargetLocationAtShellExplosion(chainGun, target);
    const shellDangerZoneRadius = getShellDangerZoneRadius(chainGun);
    const aimingDistanceToTarget = XY.lengthOf(XY.difference(shellHitLocation, targetLocationAtShellExplosion));
    return aimingDistanceToTarget < shellDangerZoneRadius;
}

/**
 * Fuze setting that detonates a shell after it has covered `distance` from the muzzle.
 * @see docs/SUBSYSTEMS.md#shell-intercept-and-fuze-geometry
 */
export function calcShellSecondsToLive(chainGun: ChainGun, distance: number) {
    return distance / Math.max(chainGun.design.bulletSpeed, 1);
}

export function getShellAimVelocityCompensation(ship: ShipState, chainGun: ChainGun): XY {
    return XY.negate(XY.scale(ship.velocity, chainGun.shellSecondsToLive));
}

export function getShellExplosionLocation(ship: ShipState, chainGun: ChainGun): XY {
    const fireAngle = chainGun.getGlobalBearing(ship);
    const fireSource = XY.add(ship.position, XY.rotate({ x: ship.radius, y: 0 }, fireAngle));
    const fireVelocity = XY.add(ship.velocity, XY.rotate({ x: chainGun.design.bulletSpeed, y: 0 }, fireAngle));
    const fireTime = chainGun.shellSecondsToLive;
    return XY.add(fireSource, XY.scale(fireVelocity, fireTime));
}

function getShellDangerZoneRadius(chainGun: ChainGun): number {
    if (chainGun.projectile === 'None') {
        return 0;
    }
    const explosionRadius = blastRadius(ammoDesigns[chainGun.projectile]);
    const shellExplosionDistance = chainGun.shellSecondsToLive * chainGun.design.bulletSpeed;
    const spreadDegrees = 3.0 * chainGun.design.bulletDegreesDeviation;
    const spread = Math.sin(degToRad * spreadDegrees) * shellExplosionDistance;
    return spread + explosionRadius;
}

export function getTargetLocationAtShellExplosion(chainGun: ChainGun, target: SpaceObject) {
    const fireTime = chainGun.shellSecondsToLive;
    return addScale(target.position, target.velocity, fireTime);
}
