import { Explosion, ShipState, SpaceObject, XY, isTargetInKillZone } from '@starwards/core/internal';

/** One instant of a ship's gunnery against one target. */
export interface GunnerySample {
    /** Target within the first chain gun's `maxShellRange`. */
    readonly inRange: boolean;
    /** `isTargetInKillZone` for the first chain gun: the current aim would put a shell's danger zone on the target. */
    readonly inKillZone: boolean;
    /** Ids of live explosions physically overlapping the target -- what happened, as opposed to `inKillZone`, what the bot believed. */
    readonly overlappingExplosionIds: readonly string[];
}

/**
 * Pure over one snapshot, so it reads a live game tick and a decoded recording frame
 * (`SavedGame.fragment.ship` / `.space`) alike.
 */
export function sampleGunnery(ship: ShipState, target: SpaceObject, objects: Iterable<SpaceObject>): GunnerySample {
    const [gun] = ship.chainGuns;
    const overlappingExplosionIds: string[] = [];
    for (const object of objects) {
        if (
            Explosion.isInstance(object) &&
            !object.destroyed &&
            XY.distance(object.position, target.position) < object.radius + target.radius
        ) {
            overlappingExplosionIds.push(object.id);
        }
    }
    return {
        inRange: XY.distance(target.position, ship.position) <= gun.design.maxShellRange,
        inKillZone: isTargetInKillZone(ship, gun, target),
        overlappingExplosionIds,
    };
}

/**
 * Fractions in range and in the kill zone (`NaN` when there are no samples), plus ground truth:
 * samples with any blast overlapping the target, and distinct explosions that ever did. The
 * overlap counts need per-tick samples -- a blast lives about a second.
 */
export function gunneryFractions(samples: readonly GunnerySample[]) {
    const count = samples.length;
    return {
        inRangeFraction: count ? samples.filter((s) => s.inRange).length / count : NaN,
        killZoneFraction: count ? samples.filter((s) => s.inKillZone).length / count : NaN,
        overlapSamples: samples.filter((s) => s.overlappingExplosionIds.length).length,
        blastHits: new Set(samples.flatMap((s) => s.overlappingExplosionIds)).size,
    };
}
