import { Asteroid, FieldOfView, Projectile, RadarSector, Spaceship, SpatialIndex, Vec2 } from '../src';

import { expect } from 'chai';

function makeSpatialIndex(objects: Iterable<{ position: Vec2; radius: number }>): SpatialIndex {
    const arr = [...objects];
    return {
        *selectPotentials() {
            yield* arr;
        },
    } as unknown as SpatialIndex;
}

function makeOmniSector(range: number) {
    const sector = new RadarSector();
    sector.direction = 0;
    sector.arc = 360;
    sector.range = range;
    return sector;
}

describe('FieldOfView', () => {
    describe('distance-dependent detection', () => {
        function makeScanner(radarRange: number) {
            const ship = new Spaceship();
            ship.id = 'scanner';
            ship.position = new Vec2(0, 0);
            ship.radarSectors.push(makeOmniSector(radarRange));
            return ship;
        }

        function makeProjectile(x: number, y: number) {
            const p = new Projectile();
            p.id = 'shell';
            p.position = new Vec2(x, y);
            p.radius = 1;
            return p;
        }

        function makeAsteroid(x: number, y: number, radius = 50) {
            const a = new Asteroid();
            a.id = 'asteroid';
            a.position = new Vec2(x, y);
            a.radius = radius;
            return a;
        }

        function findObject(fov: FieldOfView, id: string) {
            return fov.view.some((arc) => arc.object?.id === id);
        }

        it('detects small object (radius=1) at close range (~500m)', () => {
            const scanner = makeScanner(6000);
            const shell = makeProjectile(500, 0);
            const index = makeSpatialIndex([scanner, shell]);
            const fov = new FieldOfView(index, scanner);

            expect(findObject(fov, 'shell')).to.equal(true);
        });

        it('does not detect small object (radius=1) at long range (~5000m)', () => {
            const scanner = makeScanner(6000);
            const shell = makeProjectile(5000, 0);
            const index = makeSpatialIndex([scanner, shell]);
            const fov = new FieldOfView(index, scanner);

            expect(findObject(fov, 'shell')).to.equal(false);
        });

        it('detects large object (radius=50) at long range (~5000m)', () => {
            const scanner = makeScanner(6000);
            const asteroid = makeAsteroid(5000, 0);
            const index = makeSpatialIndex([scanner, asteroid]);
            const fov = new FieldOfView(index, scanner);

            expect(findObject(fov, 'asteroid')).to.equal(true);
        });

        it('detects shell at combat range (~1000m)', () => {
            const scanner = makeScanner(6000);
            const shell = makeProjectile(1000, 0);
            const index = makeSpatialIndex([scanner, shell]);
            const fov = new FieldOfView(index, scanner);

            expect(findObject(fov, 'shell')).to.equal(true);
        });

        it('does not detect shell at ~3000m', () => {
            const scanner = makeScanner(6000);
            const shell = makeProjectile(3000, 0);
            const index = makeSpatialIndex([scanner, shell]);
            const fov = new FieldOfView(index, scanner);

            expect(findObject(fov, 'shell')).to.equal(false);
        });
    });

    describe('scan beam detection', () => {
        function makeScanner(radarRange: number, beam?: { direction: number; arc: number; radius: number }) {
            const ship = new Spaceship();
            ship.id = 'scanner';
            ship.position = new Vec2(0, 0);
            ship.radarSectors.push(makeOmniSector(radarRange));
            if (beam) {
                const sector = new RadarSector();
                sector.direction = beam.direction;
                sector.arc = beam.arc;
                sector.range = beam.radius;
                ship.radarSectors.push(sector);
            }
            return ship;
        }

        function makeAsteroid(x: number, y: number, radius = 50) {
            const a = new Asteroid();
            a.id = 'asteroid';
            a.position = new Vec2(x, y);
            a.radius = radius;
            return a;
        }

        function findObject(fov: FieldOfView, id: string) {
            return fov.view.some((arc) => arc.object?.id === id);
        }

        it('detects an object inside the beam sector but outside the omni radar range', () => {
            const scanner = makeScanner(1000, { direction: 0, arc: 60, radius: 5000 });
            const asteroid = makeAsteroid(3000, 0);
            const index = makeSpatialIndex([scanner, asteroid]);
            const fov = new FieldOfView(index, scanner);

            expect(findObject(fov, 'asteroid')).to.equal(true);
        });

        it('does not detect an object outside both the omni range and the beam sector', () => {
            const scanner = makeScanner(1000, { direction: 0, arc: 60, radius: 5000 });
            // bearing 90 degrees: well outside the +-30 degree beam sector
            const asteroid = makeAsteroid(0, 3000);
            const index = makeSpatialIndex([scanner, asteroid]);
            const fov = new FieldOfView(index, scanner);

            expect(findObject(fov, 'asteroid')).to.equal(false);
        });

        it('does not detect an object beyond the beam radius even inside its arc', () => {
            const scanner = makeScanner(1000, { direction: 0, arc: 60, radius: 5000 });
            const asteroid = makeAsteroid(6000, 0);
            const index = makeSpatialIndex([scanner, asteroid]);
            const fov = new FieldOfView(index, scanner);

            expect(findObject(fov, 'asteroid')).to.equal(false);
        });

        it('still detects objects within the omni radar range when a beam is active', () => {
            const scanner = makeScanner(1000, { direction: 0, arc: 60, radius: 5000 });
            const asteroid = makeAsteroid(0, 800);
            const index = makeSpatialIndex([scanner, asteroid]);
            const fov = new FieldOfView(index, scanner);

            expect(findObject(fov, 'asteroid')).to.equal(true);
        });

        it('does not extend detection when the beam has zero radius/arc', () => {
            const scanner = makeScanner(1000);
            const asteroid = makeAsteroid(3000, 0);
            const index = makeSpatialIndex([scanner, asteroid]);
            const fov = new FieldOfView(index, scanner);

            expect(findObject(fov, 'asteroid')).to.equal(false);
        });
    });

    describe('FieldOfView — multi-radar sectors', () => {
        function makeSector(direction: number, arc: number, range: number) {
            const sector = new RadarSector();
            sector.direction = direction;
            sector.arc = arc;
            sector.range = range;
            return sector;
        }

        function makeScanner(...sectors: RadarSector[]) {
            const ship = new Spaceship();
            ship.id = 'scanner';
            ship.position = new Vec2(0, 0);
            for (const sector of sectors) {
                ship.radarSectors.push(sector);
            }
            return ship;
        }

        function makeAsteroid(x: number, y: number, id = 'asteroid', radius = 50) {
            const a = new Asteroid();
            a.id = id;
            a.position = new Vec2(x, y);
            a.radius = radius;
            return a;
        }

        function findObject(fov: FieldOfView, id: string) {
            return fov.view.some((arc) => arc.object?.id === id);
        }

        // Distance of the free-space (object === null) arc that covers a given world bearing,
        // or undefined when no free-space arc covers that bearing.
        function freeSpaceDistanceAt(fov: FieldOfView, bearing: number): number | undefined {
            const b = ((bearing % 360) + 360) % 360;
            const arc = fov.view.find((a) => a.object === null && a.fromAngle <= b && b < a.toAngle);
            return arc?.distance;
        }

        it('UNION detection: an object is visible if within ANY sector', () => {
            const omni = () => makeSector(0, 360, 1000);
            const beam = () => makeSector(0, 60, 5000);

            // only in omni: bearing 90 degrees, distance 800
            const inOmni = makeAsteroid(0, 800);
            const fovOmni = new FieldOfView(makeSpatialIndex([inOmni]), makeScanner(omni(), beam()));
            expect(findObject(fovOmni, 'asteroid')).to.equal(true);

            // only in beam: bearing 0 degrees, distance 3000 (beyond the 1000 omni range)
            const inBeam = makeAsteroid(3000, 0);
            const fovBeam = new FieldOfView(makeSpatialIndex([inBeam]), makeScanner(omni(), beam()));
            expect(findObject(fovBeam, 'asteroid')).to.equal(true);

            // outside all sectors: bearing 90 degrees, distance 3000
            const outside = makeAsteroid(0, 3000);
            const fovOutside = new FieldOfView(makeSpatialIndex([outside]), makeScanner(omni(), beam()));
            expect(findObject(fovOutside, 'asteroid')).to.equal(false);
        });

        it('PER-ARC free-space boundary: the null-object arc range follows the covering sector', () => {
            const scanner = makeScanner(makeSector(0, 360, 1000), makeSector(0, 60, 5000));
            const fov = new FieldOfView(makeSpatialIndex([scanner]), scanner);

            // bearings inside the beam (within +-30 of direction 0) reach the beam range
            expect(freeSpaceDistanceAt(fov, 15)).to.be.closeTo(5000, 1);
            expect(freeSpaceDistanceAt(fov, 345)).to.be.closeTo(5000, 1);

            // bearings outside the beam only reach the omni range
            expect(freeSpaceDistanceAt(fov, 180)).to.be.closeTo(1000, 1);
        });

        it('OCCLUSION preserved inside a sector: a near object shadows a far one at the same bearing', () => {
            const scanner = makeScanner(makeSector(0, 360, 6000));
            const near = makeAsteroid(1000, 0, 'near');
            const far = makeAsteroid(2000, 0, 'far');
            const fov = new FieldOfView(makeSpatialIndex([scanner, near, far]), scanner);

            expect(findObject(fov, 'near')).to.equal(true);
            expect(findObject(fov, 'far')).to.equal(false);
        });

        it('OMNI-DEAD + BEAM-ALIVE: only beam bearings see, others are blind', () => {
            const scanner = makeScanner(makeSector(0, 60, 5000));

            // bearing 180, distance 500: no sector covers this bearing
            const behind = makeAsteroid(-500, 0, 'behind');
            const fovBehind = new FieldOfView(makeSpatialIndex([behind]), makeScanner(makeSector(0, 60, 5000)));
            expect(findObject(fovBehind, 'behind')).to.equal(false);

            // bearing 0, distance 3000: inside the beam sector
            const ahead = makeAsteroid(3000, 0, 'ahead');
            const fovAhead = new FieldOfView(makeSpatialIndex([ahead]), makeScanner(makeSector(0, 60, 5000)));
            expect(findObject(fovAhead, 'ahead')).to.equal(true);

            // free-space arcs exist only across the beam bearings
            const fov = new FieldOfView(makeSpatialIndex([scanner]), scanner);
            expect(freeSpaceDistanceAt(fov, 15)).to.be.closeTo(5000, 1);
            const blind = freeSpaceDistanceAt(fov, 180);
            expect(blind === undefined || blind === 0).to.equal(true);
        });
    });
});
