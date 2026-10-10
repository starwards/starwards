import { XY } from '@starwards/core';

/**
 * Whether the helms radar's rim indicator should show this object as the ship's weapons target:
 * it is the locked target and lies beyond the radar's range (in range, the blip's selection marker shows it).
 */
export function isWeaponsTargetOutOfRange(
    o: { id: string; position: XY },
    weaponsTargetId: string | null | undefined,
    center: XY,
    range: number,
): boolean {
    return !!weaponsTargetId && o.id === weaponsTargetId && XY.distance(o.position, center) > range;
}
