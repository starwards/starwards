import { FieldOfView, MIN_RADAR_DETECT_FACTOR, RadarSector, ShipModel, Spaceship, SpatialIndex, Vec2 } from '../src';
import {
    MIN_HULL_RADIUS,
    MIN_HULL_RADIUS_ANGULAR,
    makeShipState,
    validateHullRadius,
} from '../src/ship/make-ship-state';
import { shipConfigurations, shipModels } from '../src/configurations';
import { ANGLE_QUANTUM_DEGREES } from '../src/logic/formulas';

const expectedRadii: Record<ShipModel, number> = {
    'demo-ship': 16.8,
    'dragonfly-MK1': 11.2,
    'dragonfly-MK2': 11.2,
    gravitas: 22.4,
    predator: 22.4,
    glaive: 33.6,
    cataphract: 44.8,
    freighter: 33.6,
    'small-station': 500,
    'chaingun-platform': 800,
    'large-station': 1_200,
};

function makeSpatialIndex(objects: Iterable<{ position: Vec2; radius: number }>): SpatialIndex {
    const arr = [...objects];
    return {
        *selectPotentials() {
            yield* arr;
        },
    } as unknown as SpatialIndex;
}

function makeScanner(radarRange: number) {
    const scanner = new Spaceship();
    scanner.id = 'scanner';
    scanner.position = new Vec2(0, 0);
    const sector = new RadarSector();
    sector.direction = 0;
    sector.arc = 360;
    sector.range = radarRange;
    scanner.radarSectors.push(sector);
    return scanner;
}

function detects(scanner: Spaceship, target: Spaceship): boolean {
    const index = makeSpatialIndex([scanner, target]);
    const fov = new FieldOfView(index, scanner);
    return fov.view.some((arc) => arc.object?.id === target.id);
}

describe('hull radius per configuration (issue #2065)', () => {
    test.each(Object.entries(expectedRadii))('%s carries the decided hull radius', (key, radius) => {
        expect(shipConfigurations[key as ShipModel].radius).toBe(radius);
    });

    test('every ship model carries an entry in the expectation table', () => {
        expect(shipModels.sort()).toEqual(Object.keys(expectedRadii).sort());
    });
});

describe('hull radius drives detection range (field-of-view gate)', () => {
    it('a dragonfly-MK1 fighter is detected beyond the 120km station perimeter', () => {
        const scanner = makeScanner(5_000_000);
        const fighter = new Spaceship();
        fighter.id = 'fighter';
        fighter.radius = shipConfigurations['dragonfly-MK1'].radius;
        fighter.position = new Vec2(125_000, 0);

        expect(detects(scanner, fighter)).toBe(true);
    });

    it('a station hull is detected at its own 120km radar range, same as before this change', () => {
        const scanner = makeScanner(5_000_000);
        const station = new Spaceship();
        station.id = 'station';
        station.radius = shipConfigurations['large-station'].radius;
        station.position = new Vec2(120_000, 0);

        expect(detects(scanner, station)).toBe(true);
    });

    // The field-of-view gate (`object.radius > MIN_RADAR_DETECT_FACTOR * sqrt(distance)`) implies a
    // max detection distance of (radius / factor)^2. Checked against the formula directly — the
    // sweep's angular precision floor makes asserting this through FieldOfView.view unreliable at
    // extreme range, since a hull's angular width there rounds to zero.
    function maxDetectionRange(radius: number): number {
        return (radius / MIN_RADAR_DETECT_FACTOR) ** 2;
    }

    it('a dragonfly-MK1 clears the 120km perimeter with margin', () => {
        expect(maxDetectionRange(shipConfigurations['dragonfly-MK1'].radius)).toBeGreaterThan(120_000 * 1.5);
    });
});

describe('hull radius boot assertion: the 120km detectability floor', () => {
    it('the floor matches MIN_RADAR_DETECT_FACTOR at the 120km station perimeter', () => {
        expect(MIN_HULL_RADIUS).toBeCloseTo(MIN_RADAR_DETECT_FACTOR * Math.sqrt(120_000), 5);
        expect(MIN_HULL_RADIUS).toBeCloseTo(8.66, 2);
    });

    it('accepts a hull radius comfortably above the floor', () => {
        expect(() => validateHullRadius(50, 'test-hull')).not.toThrow();
    });

    it('rejects a hull radius at or below the floor, naming the hull and the 120km perimeter', () => {
        expect(() => validateHullRadius(8, 'tiny-hull')).toThrow(/tiny-hull/);
        expect(() => validateHullRadius(8, 'tiny-hull')).toThrow(/120/);
        expect(() => validateHullRadius(MIN_HULL_RADIUS, 'edge-hull')).toThrow();
    });

    it('every shipped hull configuration clears the floor', () => {
        for (const model of shipModels) {
            expect(() => validateHullRadius(shipConfigurations[model].radius, model)).not.toThrow();
        }
    });

    it('makeShipState refuses to build a ship whose configured radius is at or below the floor', () => {
        const unsafeDesign = { ...shipConfigurations['dragonfly-MK1'], radius: 5 };
        expect(() => makeShipState('unsafe-ship', unsafeDesign)).toThrow(/radius/i);
    });
});

// The binding constraint on long-range detection is angular precision, not the radius gate:
// `limitPercisionHard` rounds arc endpoints to the nearest ANGLE_QUANTUM_DEGREES, so a hull whose
// angular width falls below that quantum at the 120km line is invisible regardless of the radius
// gate. See issue #2076.
describe('hull radius boot assertion: the angular-precision floor', () => {
    it('the floor is derived from the angle quantum, not a hardcoded literal', () => {
        expect(MIN_HULL_RADIUS_ANGULAR).toBeCloseTo((ANGLE_QUANTUM_DEGREES * 120_000 * Math.PI) / 180 / 2, 5);
        expect(MIN_HULL_RADIUS_ANGULAR).toBeCloseTo(10.47, 2);
    });

    it('the angular floor is the binding (larger) constraint over the radius-gate floor', () => {
        expect(MIN_HULL_RADIUS_ANGULAR).toBeGreaterThan(MIN_HULL_RADIUS);
    });

    it('rejects a hull radius above the radius-gate floor but at or below the angular floor', () => {
        expect(MIN_HULL_RADIUS).toBeLessThan(10);
        expect(() => validateHullRadius(10, 'sub-quantum-hull')).toThrow(/sub-quantum-hull/);
    });

    it('every shipped hull configuration clears the angular floor', () => {
        for (const model of shipModels) {
            expect(shipConfigurations[model].radius).toBeGreaterThan(MIN_HULL_RADIUS_ANGULAR);
        }
    });
});
