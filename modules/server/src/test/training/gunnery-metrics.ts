import { ShipState, SpaceObject, XY, isTargetInKillZone } from '@starwards/core/internal';

/** One instant of a ship's gunnery against one target. */
export interface GunnerySample {
    /** Target within the first chain gun's `maxShellRange`. */
    readonly inRange: boolean;
    /** `isTargetInKillZone` for the first chain gun: the current aim would put a shell's danger zone on the target. */
    readonly inKillZone: boolean;
}

/** Pure over one snapshot of `ship` and `target`. */
export function sampleGunnery(ship: ShipState, target: SpaceObject): GunnerySample {
    return {
        inRange: XY.distance(target.position, ship.position) <= ship.chainGuns[0].design.maxShellRange,
        inKillZone: isTargetInKillZone(ship, ship.chainGuns[0], target),
    };
}

/** Fractions in range and in the kill zone -- what the bot believed; `NaN` when there are no samples. */
export function gunneryFractions(samples: readonly GunnerySample[]) {
    const count = samples.length;
    return {
        inRangeFraction: count ? samples.filter((s) => s.inRange).length / count : NaN,
        killZoneFraction: count ? samples.filter((s) => s.inKillZone).length / count : NaN,
    };
}

/** Median of the finite values; `NaN` when there are none. */
export function median(values: readonly number[]): number {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) {
        return NaN;
    }
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
