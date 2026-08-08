import {
    Faction,
    FieldOfView,
    Nebula,
    Projectile,
    SpaceDriver,
    SpaceObject,
    SpatialIndex,
    getSpatialIndex,
} from '@starwards/core/internal';

/**
 * What a station's radar can see, computed the way the browser's `RadarRangeFilter` computes it.
 *
 * All of space is broadcast to every client, so a station's picture is a filter the client applies,
 * not a filter the server applied. A headless client that skips this filter is a client that sees
 * through the fog of war — so this recomputes the same predicate from the same core `FieldOfView`
 * over the same synced `radarSectors`, and the parity tests hold it to that.
 *
 * Every ship-facing radar in the browser tracks the fields of view of the whole faction, not of the
 * own ship alone: a contact one friendly ship can see is on everyone's radar. That is reproduced
 * here, and it is why the predicate takes a faction rather than a ship.
 */
export class RadarView {
    constructor(
        private spatial: SpatialIndex,
        private objects: Iterable<SpaceObject>,
    ) {}

    static fromDriver(spaceDriver: SpaceDriver) {
        return new RadarView(getSpatialIndex(spaceDriver), spaceDriver.state);
    }

    /**
     * The objects visible to `faction`. An undefined faction is the game-master view: no filtering
     * at all, matching the GM radar, which tracks every object's field of view and draws every blip.
     */
    visibleObjects(faction: Faction | undefined): Set<SpaceObject> {
        const visible = new Set<SpaceObject>();
        for (const object of this.objects) {
            if (faction === undefined) {
                visible.add(object);
                continue;
            }
            if (Nebula.isInstance(object)) {
                // a nebula is a visible optical hazard, not a scanned contact: every radar shows
                // it regardless of field of view, matching the browser's RadarRangeFilter.
                visible.add(object);
                continue;
            }
            if (object.faction !== faction) {
                continue;
            }
            const fov = new FieldOfView(this.spatial, object);
            visible.add(object);
            for (const visibleArc of fov.view) {
                visibleArc.object && visibleArc.object.isRadarContact && visible.add(visibleArc.object);
            }
        }
        return visible;
    }

    /**
     * The tactical radar draws the ship's own shells regardless of radar coverage — a gunner watches
     * their own rounds fly, which discloses nothing the gunner did not already fire.
     */
    ownProjectiles(shipId: string): SpaceObject[] {
        const own: SpaceObject[] = [];
        for (const object of this.objects) {
            if (Projectile.isInstance(object) && object.shipId === shipId) {
                own.push(object);
            }
        }
        return own;
    }
}
