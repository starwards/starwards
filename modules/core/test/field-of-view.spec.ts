import { Asteroid, FieldOfView, Projectile, Spaceship, SpatialIndex, Vec2 } from '../src';

import { expect } from 'chai';

function makeSpatialIndex(objects: Iterable<{ position: Vec2; radius: number }>): SpatialIndex {
    const arr = [...objects];
    return {
        *selectPotentials() {
            yield* arr;
        },
    } as unknown as SpatialIndex;
}

describe('FieldOfView', () => {
    describe('distance-dependent detection', () => {
        function makeScanner(radarRange: number) {
            const ship = new Spaceship();
            ship.id = 'scanner';
            ship.position = new Vec2(0, 0);
            ship.radarRange = radarRange;
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
            ship.radarRange = radarRange;
            if (beam) {
                ship.scanBeamDirection = beam.direction;
                ship.scanBeamArc = beam.arc;
                ship.scanBeamRadius = beam.radius;
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
});
