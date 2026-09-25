import { Asteroid, SpaceObject, Spaceship } from '../space';
import { Circle } from 'detect-collisions';
import type { SpatialIndex } from './space-manager';
import { XY } from './xy';

/** How far ahead a craft looks, in seconds of travel at its current speed. */
export const AVOIDANCE_LOOKAHEAD_SECONDS = 3;
/** Floor on the lookahead distance, so a craft starting from rest still sees what's in front of it. */
const MIN_LOOKAHEAD_METERS = 1_000;
/** Gap kept between a craft's hull and the solid it passes. */
const AVOIDANCE_CLEARANCE_METERS = 100;

/**
 * Local obstacle avoidance: the nearest solid (ship, station or asteroid) whose body cuts the
 * lookahead corridor toward `destination` replaces `destination` with the tangent point of that
 * solid (inflated by both radii and a clearance), on the side the path already passes it. The corridor runs {@link AVOIDANCE_LOOKAHEAD_SECONDS}
 * of travel at `speed` (at least {@link MIN_LOOKAHEAD_METERS}), stops at `destination`, and is as wide
 * as the craft plus the solid plus {@link AVOIDANCE_CLEARANCE_METERS}. One obstacle per call, no search:
 * re-evaluated every tick, the waypoint slides past the solid as the craft does.
 * @see docs/design/mechanics/movement.md#local-obstacle-avoidance-done
 */
export function avoidObstacles(
    craft: { readonly position: XY; readonly radius: number },
    destination: XY,
    speed: number,
    spatialIndex: SpatialIndex,
    ignoreIds: readonly (string | null | undefined)[],
): XY {
    const toDestination = XY.difference(destination, craft.position);
    const distance = XY.lengthOf(toDestination);
    if (distance === 0) {
        return destination;
    }
    const direction = XY.scale(toDestination, 1 / distance);
    const lookahead = Math.min(distance, Math.max(speed * AVOIDANCE_LOOKAHEAD_SECONDS, MIN_LOOKAHEAD_METERS));
    const corridorCenter = XY.add(craft.position, XY.scale(direction, lookahead / 2));
    let nearest: { solid: SpaceObject; along: number; across: number } | undefined;
    for (const solid of spatialIndex.selectPotentials(new Circle(XY.clone(corridorCenter), lookahead / 2))) {
        if (
            !(Spaceship.isInstance(solid) || Asteroid.isInstance(solid)) ||
            solid.destroyed ||
            ignoreIds.includes(solid.id)
        ) {
            continue;
        }
        const offset = XY.difference(solid.position, craft.position);
        const along = XY.dot(offset, direction);
        const across = direction.x * offset.y - direction.y * offset.x;
        const clearance = solid.radius + craft.radius + AVOIDANCE_CLEARANCE_METERS;
        if (along > 0 && along - solid.radius < lookahead && Math.abs(across) < clearance) {
            if (!nearest || along < nearest.along) {
                nearest = { solid, along, across };
            }
        }
    }
    if (!nearest) {
        return destination;
    }
    const { solid, across } = nearest;
    // Head along the tangent to the solid inflated by the clearance, on the side the path already
    // passes it (dead ahead: the left); a waypoint abeam the solid's centre would clip its near side.
    const side = across > 0 ? -1 : 1;
    const inflated = solid.radius + craft.radius + AVOIDANCE_CLEARANCE_METERS;
    const toSolid = XY.difference(solid.position, craft.position);
    const distanceToSolid = XY.lengthOf(toSolid);
    const tangentDegrees = distanceToSolid > inflated ? Math.asin(inflated / distanceToSolid) * (180 / Math.PI) : 90;
    const tangentLength = Math.sqrt(Math.max(distanceToSolid ** 2 - inflated ** 2, inflated ** 2));
    return XY.add(craft.position, XY.byLengthAndDirection(tangentLength, XY.angleOf(toSolid) + side * tangentDegrees));
}
