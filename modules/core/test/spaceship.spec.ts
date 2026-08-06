import { Faction, Spaceship, Vec2 } from '../src';
import { JsonPointer } from '../src/json-ptr';
import { getTweakables } from '../src/tweakable';

describe('Spaceship', () => {
    describe('callsign field', () => {
        test('defaults to empty string', () => {
            const ship = new Spaceship();
            expect(ship.callsign).toBe('');
        });

        test('init() sets callsign to id when callsign is empty', () => {
            const ship = new Spaceship().init('my-ship-id', new Vec2(0, 0), 'demo-ship', Faction.NONE);
            expect(ship.callsign).toBe('my-ship-id');
        });

        test('init() does not overwrite a pre-set callsign', () => {
            const ship = new Spaceship();
            ship.callsign = 'Alpha';
            ship.init('my-ship-id', new Vec2(0, 0), 'demo-ship', Faction.NONE);
            expect(ship.callsign).toBe('Alpha');
        });
    });

    describe('radius field', () => {
        test('init() sets radius from the ship configuration', () => {
            const ship = new Spaceship().init('my-ship-id', new Vec2(0, 0), 'dragonfly-MK1', Faction.NONE);
            expect(ship.radius).toBeCloseTo(11.2, 5);
        });

        test('init() sets a different radius for a different hull', () => {
            const ship = new Spaceship().init('my-ship-id', new Vec2(0, 0), 'large-station', Faction.NONE);
            expect(ship.radius).toBeCloseTo(50.4, 5);
        });
    });

    describe('velocity field', () => {
        test('is exposed to the GM tweak panel as a vec2 blade', () => {
            const ship = new Spaceship();
            const velocityTweakable = getTweakables(ship).find((t) => t.field === 'velocity');
            expect(velocityTweakable?.config).toBe('vec2');
        });

        test('x and y are writable via JSON Pointer (GM direct-control surface)', () => {
            const ship = new Spaceship();
            JsonPointer.create('/velocity/x').set(ship, 12);
            JsonPointer.create('/velocity/y').set(ship, -7);
            expect(ship.velocity.x).toBeCloseTo(12, 2);
            expect(ship.velocity.y).toBeCloseTo(-7, 2);
        });
    });
});
