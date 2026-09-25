import { ChainGun, ShipState } from '../ship';
import { Faction, SpaceObject, Spaceship, ammoDesigns, blastRadius } from '../space';
import { RTuple2, addScale, degToRad, timeToIntercept } from './formulas';

import { XY } from './xy';

const MAX_INTERCEPT_SECONDS = 100;

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
 * @see docs/SUBSYSTEMS.md#intercept-solutions
 */
export function solveShellIntercept(ship: ShipState, chainGun: ChainGun, target: SpaceObject): ShellIntercept {
    const bulletSpeed = Math.max(chainGun.design.bulletSpeed, 1);
    const shipToTarget = XY.difference(target.position, ship.position);
    const relativeVelocity = XY.difference(target.velocity, ship.velocity);
    // the shell leaves the hull, so the firing line expands from `ship.radius` outward
    const secondsToLive = timeToIntercept(shipToTarget, relativeVelocity, bulletSpeed, ship.radius);
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

export function getKillZoneRadiusRange(chainGun: ChainGun): RTuple2 {
    const shellExplosionDistance = chainGun.shellSecondsToLive * chainGun.design.bulletSpeed;
    if (chainGun.projectile === 'None') {
        return [0, 1_000_000];
    }
    const explosionRadius = blastRadius(chainGun.projectile);
    return [shellExplosionDistance - 3.0 * explosionRadius, shellExplosionDistance + 3.0 * explosionRadius];
}

export function isTargetInKillZone(ship: ShipState, chainGun: ChainGun, target: SpaceObject) {
    const shellHitLocation = getShellExplosionLocation(ship, chainGun);
    const targetLocationAtShellExplosion = getTargetLocationAtShellExplosion(chainGun, target);
    const shellDangerZoneRadius = getShellDangerZoneRadius(chainGun);
    const aimingDistanceToTarget = XY.distance(shellHitLocation, targetLocationAtShellExplosion);
    return aimingDistanceToTarget < shellDangerZoneRadius;
}

/**
 * Fuze setting that detonates a shell after it has covered `distance` from the muzzle.
 * @see docs/SUBSYSTEMS.md#intercept-solutions
 */
export function calcShellSecondsToLive(chainGun: ChainGun, distance: number) {
    return distance / Math.max(chainGun.design.bulletSpeed, 1);
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
    const explosionRadius = blastRadius(chainGun.projectile);
    const shellExplosionDistance = chainGun.shellSecondsToLive * chainGun.design.bulletSpeed;
    const spreadDegrees = 3.0 * chainGun.design.bulletDegreesDeviation;
    const spread = Math.sin(degToRad * spreadDegrees) * shellExplosionDistance;
    return spread + explosionRadius;
}

export function getTargetLocationAtShellExplosion(chainGun: ChainGun, target: SpaceObject) {
    const fireTime = chainGun.shellSecondsToLive;
    return addScale(target.position, target.velocity, fireTime);
}

/**
 * Whether a friendly solid sits on `mount`'s firing line: the segment its next shell flies, from the
 * muzzle to where the current fuze setting detonates it, widened by the shell's radius. Friendly means
 * a live `Spaceship` of the shooter's faction (stations included), other than the shooter and
 * `targetId`; neutral (`Faction.NONE`) is no faction, so a neutral shooter has no friends. Friendly
 * fire stays -- this only tells the shooter.
 * @see docs/design/mechanics/line-of-fire.md
 */
export function isLineOfFireBlocked(
    ship: ShipState,
    mount: ChainGun,
    solids: Iterable<SpaceObject>,
    targetId: string | null = null,
): boolean {
    if (mount.projectile === 'None') {
        return false;
    }
    const shellRadius = ammoDesigns[mount.projectile].radius;
    const muzzle = XY.add(ship.position, XY.rotate({ x: ship.radius, y: 0 }, mount.getGlobalBearing(ship)));
    const detonation = getShellExplosionLocation(ship, mount);
    for (const solid of solids) {
        if (
            Spaceship.isInstance(solid) &&
            !solid.destroyed &&
            ship.faction !== Faction.NONE &&
            solid.faction === ship.faction &&
            solid.id !== ship.id &&
            solid.id !== targetId &&
            distanceToSegment(solid.position, muzzle, detonation) < solid.radius + shellRadius
        ) {
            return true;
        }
    }
    return false;
}

function distanceToSegment(point: XY, start: XY, end: XY): number {
    const segment = XY.difference(end, start);
    const lengthSquared = XY.dot(segment, segment);
    const t =
        lengthSquared > 0 ? Math.max(0, Math.min(1, XY.dot(XY.difference(point, start), segment) / lengthSquared)) : 0;
    return XY.distance(point, addScale(start, segment, t));
}
