import { Waypoint } from '@starwards/core';

/**
 * Whether the helms radar's off-screen "out of range" indicator should track this waypoint.
 * Scoped to this ship's own waypoints, but not to a specific `collection` — dradis-placed
 * waypoints default to no named collection, and the pilot must still be able to navigate to them.
 */
export function isOwnWaypoint(waypoint: Pick<Waypoint, 'owner' | 'collection'>, shipId: string): boolean {
    return waypoint.owner === shipId;
}
