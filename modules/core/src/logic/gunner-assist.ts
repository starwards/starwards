import { ChainGun, ShipState } from '../ship';
import { RTuple2, addScale, degToRad } from './formulas';
import { SpaceObject, ammoDesigns, blastRadius } from '../space';

import { XY } from './xy';

const MAX_INTERCEPT_SECONDS = 100;
/** Below this the quadratic below is linear — the shell and the closing rate cancel out. */
const INTERCEPT_DEGENERATE_EPSILON = 1e-6;

/** Where a mount must point, and for how long its shell must live, to hit a target. */
export type ShellIntercept = {
    /** Time of flight, and therefore the fuze setting that detonates the shell on the target. */
    secondsToLive: number;
    /**
     * Point to lay the mount's firing line on. It carries both corrections at once: the target's
     * own motion over the time of flight, and the shell's inherited hull velocity, which a bolted
     * mount cannot correct for itself.
     */
    aimPoint: XY;
    /**
     * Whether a shell can reach the target at all — `false` exactly when the target's velocity
     * relative to the firing ship meets or exceeds the muzzle speed along the line of sight. The
     * other two fields then degrade to tracking the target's present position, so a mount still
     * follows it and the hull can still turn toward it, but nothing may commit to the shot.
     */
    reachable: boolean;
};

/**
 * Solves the shell intercept for `chainGun` against `target`.
 *
 * A shell is launched from the muzzle — `ship.radius` along the firing line `û`, not from the hull
 * centre — at `ship.velocity + bulletSpeed · û`, so after `T` it sits at
 * `ship.position + (ship.radius + bulletSpeed · T) · û + ship.velocity · T`. Putting that on the
 * target's predicted position leaves the aim point at `target.position + w · T`, where `w` is the
 * target's velocity *relative to the firing ship*, and the range condition
 * `|aimPoint − ship.position| = ship.radius + bulletSpeed · T`. Note the speed here is the *muzzle*
 * speed: in the ship's own frame that is all the shell has, which is what keeps the fuze, the aim
 * point and {@link getKillZoneRadiusRange} consistent with each other. `T` is therefore the fuze
 * setting directly — the shell's own time of flight, measured from the muzzle.
 *
 * Squaring that range condition gives a quadratic in `T`, solved in closed form — an iterative
 * refinement diverges once `|w|` approaches the muzzle speed, exactly the fast-transit case that
 * needs the answer most. When no positive root exists the target outruns the shell: the result is
 * marked unreachable and degrades to tracking the target's present position.
 */
export function solveShellIntercept(ship: ShipState, chainGun: ChainGun, target: SpaceObject): ShellIntercept {
    const bulletSpeed = Math.max(chainGun.design.bulletSpeed, 1);
    const shipToTarget = XY.difference(target.position, ship.position);
    const relativeVelocity = XY.difference(target.velocity, ship.velocity);
    // |shipToTarget + w·T| = radius + bulletSpeed·T  =>  a·T² + b·T + c = 0
    const a = XY.dot(relativeVelocity, relativeVelocity) - bulletSpeed * bulletSpeed;
    const b = 2 * XY.dot(shipToTarget, relativeVelocity) - 2 * ship.radius * bulletSpeed;
    const c = XY.dot(shipToTarget, shipToTarget) - ship.radius * ship.radius;
    const secondsToLive = smallestPositiveRoot(a, b, c);
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

function smallestPositiveRoot(a: number, b: number, c: number): number | null {
    if (Math.abs(a) < INTERCEPT_DEGENERATE_EPSILON) {
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
 * Fuze setting that detonates a shell after it has covered `distance` — measured, like every other
 * range in the gunnery chain, in the firing ship's own frame, where the shell only ever travels at
 * muzzle speed. Dialling a range therefore gets that range, measured from the muzzle — the shell
 * starts its flight at `ship.radius` along the firing line, so {@link getShellExplosionLocation}
 * puts the detonation `radius + distance` from the hull centre, {@link getKillZoneRadiusRange}
 * draws the ring the same way, and {@link solveShellIntercept} solves for the same quantity.
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
