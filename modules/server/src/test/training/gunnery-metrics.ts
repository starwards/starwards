import { ShipState, SpaceObject, XY, isTargetInKillZone } from '@starwards/core/internal';

/** One instant of a ship's gunnery against one target. */
export interface GunnerySample {
    /** Target within the first chain gun's `maxShellRange`. */
    readonly inRange: boolean;
    /** `isTargetInKillZone` for the first chain gun: the current aim would put a shell's danger zone on the target. */
    readonly inKillZone: boolean;
}

/**
 * Pure over one snapshot, so it reads a live game tick and a decoded recording frame
 * (`SavedGame.fragment.ship` / `.space`) alike.
 */
export function sampleGunnery(ship: ShipState, target: SpaceObject): GunnerySample {
    const [gun] = ship.chainGuns;
    return {
        inRange: XY.distance(target.position, ship.position) <= gun.design.maxShellRange,
        inKillZone: isTargetInKillZone(ship, gun, target),
    };
}

/** Fraction of samples in range and in the kill zone; `NaN` when there are none. */
export function gunneryFractions(samples: readonly GunnerySample[]) {
    const count = samples.length;
    return {
        inRangeFraction: count ? samples.filter((s) => s.inRange).length / count : NaN,
        killZoneFraction: count ? samples.filter((s) => s.inKillZone).length / count : NaN,
    };
}
