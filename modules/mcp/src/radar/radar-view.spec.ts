import {
    Asteroid,
    Faction,
    FieldOfView,
    Nebula,
    Projectile,
    RadarSector,
    SpaceObject,
    Spaceship,
    SpatialIndex,
    Vec2,
} from '@starwards/core/internal';

import { RadarView } from './radar-view';
import { expect } from 'chai';

function makeSpatialIndex(objects: Iterable<SpaceObject>): SpatialIndex {
    const arr = [...objects];
    return {
        *selectPotentials() {
            yield* arr;
        },
    };
}

function sector(range: number, direction = 0, arc = 360) {
    const s = new RadarSector();
    s.direction = direction;
    s.arc = arc;
    s.range = range;
    return s;
}

function ship(id: string, x: number, y: number, faction: Faction, radarRange?: number, arc = 360, direction = 0) {
    const s = new Spaceship();
    s.id = id;
    s.position = new Vec2(x, y);
    s.faction = faction;
    s.radius = 50;
    if (radarRange !== undefined) {
        s.radarSectors.push(sector(radarRange, direction, arc));
    }
    return s;
}

function asteroid(id: string, x: number, y: number, radius = 50) {
    const a = new Asteroid();
    a.id = id;
    a.position = new Vec2(x, y);
    a.radius = radius;
    return a;
}

function nebula(id: string, x: number, y: number, radius = 50) {
    const n = new Nebula();
    n.id = id;
    n.position = new Vec2(x, y);
    n.radius = radius;
    return n;
}

/**
 * The browser's `RadarRangeFilter.update()`, reduced to the set it produces. The production code
 * must agree with this on every case below — this is the definition of "sees what the station sees".
 */
function browserVisibleSet(spatial: SpatialIndex, objects: SpaceObject[], faction: Faction): Set<SpaceObject> {
    const visible = new Set<SpaceObject>();
    for (const observer of objects.filter((o) => o.faction === faction)) {
        const fov = new FieldOfView(spatial, observer);
        visible.add(observer);
        for (const arc of fov.view) {
            arc.object && !arc.object.isRadarInvisible && visible.add(arc.object);
        }
    }
    return visible;
}

function ids(objects: Iterable<SpaceObject>) {
    return [...objects].map((o) => o.id).sort();
}

function viewOf(objects: SpaceObject[]) {
    return new RadarView(makeSpatialIndex(objects), objects);
}

describe('RadarView', () => {
    it('matches the browser filter for a contact inside radar reach', () => {
        const objects = [ship('own', 0, 0, Faction.Gravitas, 5000), asteroid('rock', 1000, 0)];
        const view = viewOf(objects);
        expect(ids(view.visibleObjects(Faction.Gravitas))).to.deep.equal(
            ids(browserVisibleSet(makeSpatialIndex(objects), objects, Faction.Gravitas)),
        );
        expect(ids(view.visibleObjects(Faction.Gravitas))).to.deep.equal(['own', 'rock']);
    });

    it('drops a contact beyond the sector range', () => {
        const objects = [ship('own', 0, 0, Faction.Gravitas, 1000), asteroid('rock', 5000, 0)];
        expect(ids(viewOf(objects).visibleObjects(Faction.Gravitas))).to.deep.equal(['own']);
    });

    it('drops a contact outside the sector arc', () => {
        // a 20 degree beam pointing east; the rock sits due north
        const objects = [ship('own', 0, 0, Faction.Gravitas, 5000, 20, 0), asteroid('rock', 0, 1000)];
        expect(ids(viewOf(objects).visibleObjects(Faction.Gravitas))).to.deep.equal(['own']);
    });

    it('sees a contact inside a narrow arc that crosses zero degrees', () => {
        const objects = [ship('own', 0, 0, Faction.Gravitas, 5000, 40, 0), asteroid('rock', 1000, 0)];
        expect(ids(viewOf(objects).visibleObjects(Faction.Gravitas))).to.include('rock');
    });

    it('drops a contact too small to detect at its distance', () => {
        // MIN_RADAR_DETECT_FACTOR: a radius-1 shell is undetectable past ~1600m
        const shell = new Projectile();
        shell.id = 'shell';
        shell.position = new Vec2(4000, 0);
        shell.radius = 1;
        const objects: SpaceObject[] = [ship('own', 0, 0, Faction.Gravitas, 50_000), shell];
        expect(ids(viewOf(objects).visibleObjects(Faction.Gravitas))).to.deep.equal(['own']);
    });

    it('drops a contact shadowed by a nearer body', () => {
        const objects = [
            ship('own', 0, 0, Faction.Gravitas, 50_000),
            asteroid('blocker', 1000, 0, 500),
            asteroid('hidden', 2000, 0, 50),
        ];
        const visible = ids(viewOf(objects).visibleObjects(Faction.Gravitas));
        expect(visible).to.include('blocker');
        expect(visible).to.not.include('hidden');
        expect(visible).to.deep.equal(ids(browserVisibleSet(makeSpatialIndex(objects), objects, Faction.Gravitas)));
    });

    it('sees what a fleet-mate sees, not only what the own ship sees', () => {
        // own ship is blind; the friendly scout far away holds the contact
        const objects = [
            ship('own', 0, 0, Faction.Gravitas),
            ship('scout', 100_000, 0, Faction.Gravitas, 5000),
            asteroid('rock', 101_000, 0),
        ];
        expect(ids(viewOf(objects).visibleObjects(Faction.Gravitas))).to.deep.equal(['own', 'rock', 'scout']);
    });

    it('does not see through an enemy radar', () => {
        const objects = [
            ship('own', 0, 0, Faction.Gravitas),
            ship('foe', 100_000, 0, Faction.Raiders, 5000),
            asteroid('rock', 101_000, 0),
        ];
        expect(ids(viewOf(objects).visibleObjects(Faction.Gravitas))).to.deep.equal(['own']);
    });

    it('a nebula occludes like a solid body but never itself becomes a contact (issue #2123)', () => {
        const objects = [
            ship('own', 0, 0, Faction.Gravitas, 50_000),
            nebula('fog', 1000, 0, 500),
            asteroid('hidden', 2000, 0, 50),
        ];
        const visible = ids(viewOf(objects).visibleObjects(Faction.Gravitas));
        expect(visible).to.not.include('fog');
        expect(visible).to.not.include('hidden');
        expect(visible).to.deep.equal(ids(browserVisibleSet(makeSpatialIndex(objects), objects, Faction.Gravitas)));
    });

    it('shows the game master a nebula, unlike any faction radar', () => {
        const objects = [ship('own', 0, 0, Faction.Gravitas), nebula('fog', 100_000, 0, 500)];
        expect(ids(viewOf(objects).visibleObjects(undefined))).to.deep.equal(['fog', 'own']);
        expect(ids(viewOf(objects).visibleObjects(Faction.Gravitas))).to.deep.equal(['own']);
    });

    it('shows the game master everything, unfiltered', () => {
        const objects = [
            ship('own', 0, 0, Faction.Gravitas),
            ship('foe', 100_000, 0, Faction.Raiders, 5000),
            asteroid('rock', 500_000, 0),
        ];
        expect(ids(viewOf(objects).visibleObjects(undefined))).to.deep.equal(['foe', 'own', 'rock']);
    });

    describe('ownProjectiles', () => {
        it('returns the ship own shells and nobody else', () => {
            const mine = new Projectile();
            mine.id = 'mine';
            mine.position = new Vec2(9000, 0);
            mine.shipId = 'own';
            const theirs = new Projectile();
            theirs.id = 'theirs';
            theirs.position = new Vec2(9000, 0);
            theirs.shipId = 'foe';
            const objects: SpaceObject[] = [ship('own', 0, 0, Faction.Gravitas), mine, theirs];
            expect(ids(viewOf(objects).ownProjectiles('own'))).to.deep.equal(['mine']);
        });
    });
});
