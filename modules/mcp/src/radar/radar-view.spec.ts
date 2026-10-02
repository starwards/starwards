import {
    Asteroid,
    Explosion,
    Faction,
    FieldOfView,
    Nebula,
    Projectile,
    RadarSector,
    SpaceObject,
    Spaceship,
    SpatialIndex,
    StationRadarWidget,
    Vec2,
    XY,
    isSensorInvisible,
    stationRadarWidgets,
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

function explosion(id: string, x: number, y: number, radius = 200) {
    const e = new Explosion().init(id, new Vec2(x, y), 20);
    e.radius = radius;
    return e;
}

/**
 * The browser's `RadarRangeFilter.update()`, reduced to the set it produces. The production code
 * must agree with this on every case below — this is the definition of "sees what the station sees".
 */
function browserVisibleSet(spatial: SpatialIndex, objects: SpaceObject[], faction: Faction): Set<SpaceObject> {
    const visible = new Set<SpaceObject>();
    for (const observer of objects.filter((o) => o.faction === faction && !isSensorInvisible(o))) {
        const fov = new FieldOfView(spatial, observer);
        visible.add(observer);
        for (const arc of fov.view) {
            if (arc.object && !isSensorInvisible(arc.object)) {
                visible.add(arc.object);
            }
        }
    }
    for (const object of objects) {
        if (Nebula.isInstance(object)) {
            visible.add(object);
        }
    }
    return visible;
}

/**
 * What one browser radar widget draws: `RadarRangeFilter`'s set (plus, on the tactical radar, the
 * own shells it lets past the filter), masked to the circle of the widget's camera range around the
 * own ship. The ranges are the ones each screen passes its widget: helms 5 km (100 km at warp),
 * weapons' tactical 10 km, signals' long range 50 km, dradis 50 km.
 */
const browserWidgetRange: Record<StationRadarWidget, (warp: boolean) => number> = {
    'helms-radar': (warp) => (warp ? 100_000 : 5_000),
    'tactical-radar': () => 10_000,
    'long-range-radar': () => 50_000,
    'dradis-radar': () => 50_000,
};
function browserWidgetSet(
    widget: StationRadarWidget,
    objects: SpaceObject[],
    own: SpaceObject,
    warp: boolean,
): Set<SpaceObject> {
    const filtered = browserVisibleSet(makeSpatialIndex(objects), objects, own.faction);
    const drawn = (o: SpaceObject) =>
        filtered.has(o) || (widget === 'tactical-radar' && Projectile.isInstance(o) && o.shipId === own.id);
    const range = browserWidgetRange[widget](warp);
    return new Set(objects.filter((o) => drawn(o) && XY.lengthOf(XY.difference(o.position, own.position)) <= range));
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

    it('a nebula occludes like a solid body and is itself always visible, even with no radar of its own (issue #2123)', () => {
        const objects = [
            ship('own', 0, 0, Faction.Gravitas, 50_000),
            nebula('fog', 1000, 0, 500),
            asteroid('hidden', 2000, 0, 50),
        ];
        const visible = ids(viewOf(objects).visibleObjects(Faction.Gravitas));
        expect(visible).to.include('fog');
        expect(visible).to.not.include('hidden');
        expect(visible).to.deep.equal(ids(browserVisibleSet(makeSpatialIndex(objects), objects, Faction.Gravitas)));
    });

    it('shows every faction the same nebula, unlike an enemy radar contact', () => {
        // 'fog' is out of every ship's radar reach, and belongs to no faction (unlike 'foe'
        // below) -- it is visible anyway, on both the Gravitas and Raiders faction radars.
        const objects = [
            ship('own', 0, 0, Faction.Gravitas),
            ship('foe', 0, 0, Faction.Raiders),
            nebula('fog', 100_000, 0, 500),
        ];
        expect(ids(viewOf(objects).visibleObjects(Faction.Gravitas))).to.deep.equal(['fog', 'own']);
        expect(ids(viewOf(objects).visibleObjects(Faction.Raiders))).to.deep.equal(['foe', 'fog']);
    });

    it('shows the game master everything, unfiltered', () => {
        const objects = [
            ship('own', 0, 0, Faction.Gravitas),
            ship('foe', 100_000, 0, Faction.Raiders, 5000),
            asteroid('rock', 500_000, 0),
        ];
        expect(ids(viewOf(objects).visibleObjects(undefined))).to.deep.equal(['foe', 'own', 'rock']);
    });

    it('drops an explosion from a player radar — it is a shadow, not a contact', () => {
        const objects = [ship('own', 0, 0, Faction.Gravitas, 5000), explosion('blast', 1000, 0)];
        const visible = ids(viewOf(objects).visibleObjects(Faction.Gravitas));
        expect(visible).to.not.include('blast');
        expect(visible).to.deep.equal(ids(browserVisibleSet(makeSpatialIndex(objects), objects, Faction.Gravitas)));
    });

    it('still shows the explosion to the game master', () => {
        const objects = [ship('own', 0, 0, Faction.Gravitas, 5000), explosion('blast', 1000, 0)];
        expect(ids(viewOf(objects).visibleObjects(undefined))).to.deep.equal(['blast', 'own']);
    });

    it('an explosion still shadows what lies behind it, even though it produces no contact of its own', () => {
        const objects = [
            ship('own', 0, 0, Faction.Gravitas, 50_000),
            explosion('blast', 1000, 0),
            asteroid('hidden', 2000, 0, 50),
        ];
        const visible = ids(viewOf(objects).visibleObjects(Faction.Gravitas));
        expect(visible).to.not.include('blast');
        expect(visible).to.not.include('hidden');
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
    describe('seatObjects', () => {
        function scene() {
            const own = ship('own', 0, 0, Faction.Gravitas, 200_000);
            const shell = new Projectile();
            shell.id = 'my-shell';
            shell.position = new Vec2(8000, 0);
            shell.radius = 1;
            shell.shipId = 'own';
            const farShell = new Projectile();
            farShell.id = 'my-far-shell';
            farShell.position = new Vec2(0, 12_000);
            farShell.radius = 1;
            farShell.shipId = 'own';
            const objects: SpaceObject[] = [
                own,
                asteroid('near', 3000, 0, 300),
                asteroid('mid', 0, -8000, 600),
                asteroid('far', -30_000, 0, 3000),
                asteroid('very-far', 0, 80_000, 6000),
                shell,
                farShell,
            ];
            return { own, objects };
        }

        for (const widget of stationRadarWidgets) {
            for (const warp of [false, true]) {
                it(`matches what the browser ${widget} draws${warp ? ' at warp' : ''}`, () => {
                    const { own, objects } = scene();
                    const seat = viewOf(objects).seatObjects(Faction.Gravitas, [widget], {
                        ship: own,
                        warpLevel: warp ? 1 : 0,
                    });
                    expect(ids(seat)).to.deep.equal(ids(browserWidgetSet(widget, objects, own, warp)));
                });
            }
        }

        it('cuts each station to its own reach', () => {
            const { own, objects } = scene();
            const seat = (widget: StationRadarWidget) =>
                ids(viewOf(objects).seatObjects(Faction.Gravitas, [widget], { ship: own, warpLevel: 0 }));
            expect(seat('helms-radar')).to.deep.equal(['near', 'own']);
            expect(seat('tactical-radar')).to.deep.equal(['mid', 'my-shell', 'near', 'own']);
            expect(seat('long-range-radar')).to.deep.equal(['far', 'mid', 'near', 'own']);
        });

        it('draws the union of a seat holding several radars', () => {
            const { own, objects } = scene();
            const seat = viewOf(objects).seatObjects(Faction.Gravitas, ['helms-radar', 'long-range-radar'], {
                ship: own,
                warpLevel: 0,
            });
            expect(ids(seat)).to.deep.equal(['far', 'mid', 'near', 'own']);
        });
    });
});
