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
};

/**
 * Solves the shell intercept for `chainGun` against `target`.
 *
 * A shell leaves at `ship.velocity + bulletSpeed · û`, so after `t` it sits at
 * `ship.position + ship.velocity · t + bulletSpeed · t · û`. Putting that on the target's predicted
 * position leaves the aim point at `target.position + w · t`, where `w` is the target's velocity
 * *relative to the firing ship* — and `|aimPoint − ship.position| = bulletSpeed · t`. Note the speed
 * here is the *muzzle* speed: in the ship's own frame that is all the shell has, which is what keeps
 * the fuze, the aim point and {@link getKillZoneRadiusRange} consistent with each other.
 *
 * Squaring that range condition gives a quadratic in `t`, solved in closed form — an iterative
 * refinement diverges once `|w|` approaches the muzzle speed, exactly the fast-transit case that
 * needs the answer most. When no positive root exists the shot is unreachable (the target outruns
 * the shell); the mount is then aimed at the target itself and the kill-zone gate refuses the shot.
 */
export function solveShellIntercept(ship: ShipState, chainGun: ChainGun, target: SpaceObject): ShellIntercept {
    const bulletSpeed = Math.max(chainGun.design.bulletSpeed, 1);
    const shipToTarget = XY.difference(target.position, ship.position);
    const relativeVelocity = XY.difference(target.velocity, ship.velocity);
    // |shipToTarget + w·t| = bulletSpeed·t  =>  a·t² + b·t + c = 0
    const a = XY.dot(relativeVelocity, relativeVelocity) - bulletSpeed * bulletSpeed;
    const b = 2 * XY.dot(shipToTarget, relativeVelocity);
    const c = XY.dot(shipToTarget, shipToTarget);
    const secondsToLive = smallestPositiveRoot(a, b, c);
    if (secondsToLive === null || secondsToLive > MAX_INTERCEPT_SECONDS) {
        return { secondsToLive: XY.lengthOf(shipToTarget) / bulletSpeed, aimPoint: target.position };
    }
    const aimPoint = addScale(target.position, relativeVelocity, secondsToLive);
    return XY.isFinite(aimPoint) ? { secondsToLive, aimPoint } : { secondsToLive, aimPoint: target.position };
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
 * puts the detonation `radius + distance` from the hull centre, and {@link getKillZoneRadiusRange}
 * draws the ring the same way. Callers converting a hull-centre distance into a fuze setting
 * subtract `ship.radius` first.
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
