import { Faction, Spaceship, Vec2 } from '../src';

describe('Spaceship', () => {
    describe('callsign field', () => {
        test('defaults to empty string', () => {
            const ship = new Spaceship();
            expect(ship.callsign).toBe('');
        });

        test('init() sets callsign to id when callsign is empty', () => {
            const ship = new Spaceship().init('my-ship-id', new Vec2(0, 0), 'dragonfly-SF22', Faction.NONE);
            expect(ship.callsign).toBe('my-ship-id');
        });

        test('init() does not overwrite a pre-set callsign', () => {
            const ship = new Spaceship();
            ship.callsign = 'Alpha';
            ship.init('my-ship-id', new Vec2(0, 0), 'dragonfly-SF22', Faction.NONE);
            expect(ship.callsign).toBe('Alpha');
        });
    });

    describe('transponderOpen field', () => {
        test('defaults to true', () => {
            const ship = new Spaceship();
            expect(ship.transponderOpen).toBe(true);
        });
    });
});
