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
    return {
        inRange: inGunRange(ship, target),
        inKillZone: isTargetInKillZone(ship, ship.chainGuns[0], target),
    };
}

/** `target` within `ship`'s first chain gun's `maxShellRange`. */
export function inGunRange(ship: ShipState, target: { readonly position: XY }): boolean {
    return XY.distance(target.position, ship.position) <= ship.chainGuns[0].design.maxShellRange;
}

/**
 * Fractions in range and in the kill zone -- what the bot believed; `NaN` when there are no
 * samples. Needs per-tick samples: the recording carries neither. What actually hit is
 * `blastHits`, from the recorder's sidecar via `extract.ts`.
 */
export function gunneryFractions(samples: readonly GunnerySample[]) {
    const count = samples.length;
    return {
        inRangeFraction: count ? samples.filter((s) => s.inRange).length / count : NaN,
        killZoneFraction: count ? samples.filter((s) => s.inKillZone).length / count : NaN,
    };
}
