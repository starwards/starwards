import {
    Asteroid,
    Faction,
    FieldOfView,
    RadarSector,
    SpaceManager,
    Spaceship,
    SpatialIndex,
    Vec2,
    toPositiveDegreesDelta,
} from '../src';

import { ShipTestHarness } from './ship-test-harness';
import { expect } from 'chai';

// Minimal SpatialIndex stub: FieldOfView only calls selectPotentials(area) and
// iterates the result. We hand it every object; FieldOfView does the geometry.
function makeSpatialIndex(objects: Iterable<{ position: Vec2; radius: number }>): SpatialIndex {
    const arr = [...objects];
    return {
        *selectPotentials() {
            yield* arr;
        },
    } as unknown as SpatialIndex;
}

function makeSector(direction: number, arc: number, range: number) {
    const sector = new RadarSector();
    sector.direction = direction;
    sector.arc = arc;
    sector.range = range;
    return sector;
}

function makeAsteroid(x: number, y: number, id = 'asteroid', radius = 50) {
    const a = new Asteroid();
    a.id = id;
    a.position = new Vec2(x, y);
    a.radius = radius;
    return a;
}

function seesObject(fov: FieldOfView, id: string) {
    return fov.view.some((arc) => arc.object?.id === id);
}

function tick(totalSeconds: number, deltaSeconds = 1 / 60) {
    return { deltaSeconds, deltaSecondsAvg: deltaSeconds, totalSeconds };
}

describe('radar vision (beam adds visibility end-to-end)', () => {
    // 1. The ship manager populates the SYNCED spaceObject.radarSectors each tick from the
    //    ship's radars: a 360-degree omni sector (radars[0]) plus a directional beam sector
    //    (radars[1]) whose world-bearing direction = spaceObject.angle + radars[1].direction.
    describe('sectors synced from radars', () => {
        it('emits a 360-degree omni sector and a directional beam sector matching radars[1]', () => {
            const harness = new ShipTestHarness();
            // radars[1] is the directional scan beam; give it a non-zero bearing offset.
            harness.shipState.radars[1].direction = 30;
            harness.simulate(1, 30);

            const angle = harness.shipObj.angle;
            const beam = harness.shipState.radars[1];
            const sectors = [...harness.shipObj.radarSectors];

            expect(sectors.length, 'expected an omni + a beam sector').to.be.at.least(2);

            const omni = sectors.find((s) => Math.abs(s.arc - 360) < 1);
            const directional = sectors.find((s) => Math.abs(s.arc - 360) >= 1);
            expect(omni, 'omni 360-degree sector present').to.not.equal(undefined);
            expect(directional, 'directional beam sector present').to.not.equal(undefined);

            // Precondition: the beam actually has a non-zero shape this tick.
            expect(beam.arc, 'beam arc > 0').to.be.greaterThan(0);
            expect(beam.range, 'beam range > 0').to.be.greaterThan(0);

            expect(directional!.arc).to.be.closeTo(beam.arc, 1);
            expect(directional!.range).to.be.closeTo(beam.range, 1);
            expect(toPositiveDegreesDelta(directional!.direction)).to.be.closeTo(
                toPositiveDegreesDelta(angle + beam.direction),
                1,
            );
        });
    });

    // 2. THE CRUX: a client receives only the synced Spaceship fields. Build a Spaceship with
    //    ONLY radarSectors set (no server-only beam fields) and confirm the beam sector still
    //    grants vision. Today the beam is server-only, so a client sees ZERO beam vision.
    describe('client vision from synced-only state', () => {
        function makeClientShip() {
            const ship = new Spaceship();
            ship.id = 'client-ship';
            ship.position = new Vec2(0, 0);
            // Exactly what a client receives over the wire: sectors, nothing else.
            ship.radarSectors.push(makeSector(0, 360, 1000)); // omni
            ship.radarSectors.push(makeSector(0, 60, 5000)); // beam, bearing 0, +-30deg
            return ship;
        }

        it('sees an asteroid inside the beam sector but beyond the omni range', () => {
            const ship = makeClientShip();
            const inBeam = makeAsteroid(3000, 0, 'in-beam'); // bearing 0, distance 3000
            const fov = new FieldOfView(makeSpatialIndex([ship, inBeam]), ship);

            expect(seesObject(fov, 'in-beam')).to.equal(true);
        });

        it('does not see an asteroid outside the beam sector and beyond the omni range', () => {
            const ship = makeClientShip();
            const outside = makeAsteroid(0, 3000, 'outside'); // bearing 90, distance 3000
            const fov = new FieldOfView(makeSpatialIndex([ship, outside]), ship);

            expect(seesObject(fov, 'outside')).to.equal(false);
        });
    });

    // 3. The SpaceManager faction/GM shared view (space-manager.ts ~283) unions every ship's
    //    fov.view into the faction's visible set. A beam sector on ship A must push objects it
    //    covers into the faction set, even beyond A's omni range.
    describe('faction / GM shared view', () => {
        it('adds an object covered only by ship A beam sector to the faction visible set', () => {
            const spaceMgr = new SpaceManager();

            const shipA = new Spaceship();
            shipA.id = 'A';
            shipA.faction = Faction.Gravitas;
            shipA.position = new Vec2(0, 0);
            shipA.radarSectors.push(makeSector(0, 360, 1000)); // short omni
            shipA.radarSectors.push(makeSector(0, 60, 5000)); // long beam, bearing 0

            const shipB = new Spaceship();
            shipB.id = 'B';
            shipB.faction = Faction.Gravitas;
            shipB.position = new Vec2(0, 20000); // far away; only a short omni, cannot see X
            shipB.radarSectors.push(makeSector(0, 360, 1000));

            // X: bearing 0, distance 3000 from A -> beyond A's 1000 omni, inside A's 5000 beam.
            const targetX = makeAsteroid(3000, 0, 'X');

            spaceMgr.insert(shipA);
            spaceMgr.insert(shipB);
            spaceMgr.insert(targetX);
            spaceMgr.update(tick(1 / 60));

            const visible = spaceMgr.getFactionVisibleObjects(Faction.Gravitas);
            const ids = [...visible].map((o) => o.id);
            expect(ids).to.include('X');
        });
    });
});
