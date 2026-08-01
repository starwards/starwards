import { Asteroid, Faction, ScanLevel, Spaceship } from '@starwards/core';

import { objectDisplayName } from '../src/space-object-intel';

describe('objectDisplayName', () => {
    function asteroid(id: string) {
        const o = new Asteroid();
        o.id = id;
        return o;
    }

    function ship(id: string, callsign: string) {
        const o = new Spaceship();
        o.id = id;
        o.callsign = callsign;
        o.faction = Faction.Gravitas;
        return o;
    }

    test('names a non-ship by type and id', () => {
        expect(objectDisplayName(asteroid('47'), '47', ScanLevel.BASIC)).toEqual('Asteroid 47');
    });

    test('prefers a ship callsign', () => {
        expect(objectDisplayName(ship('12', 'Dragonfly'), '12', ScanLevel.BASIC)).toEqual('Dragonfly');
    });

    test('falls back to the type when a ship has no callsign', () => {
        const o = ship('12', '');
        expect(objectDisplayName(o, '12', ScanLevel.FULL)).toEqual('Spaceship 12');
    });

    test('withholds the type below BASIC — a name must not classify an unscanned contact', () => {
        expect(objectDisplayName(asteroid('47'), '47', ScanLevel.UFO)).toEqual('47');
        expect(objectDisplayName(ship('12', 'Dragonfly'), '12', ScanLevel.UFO)).toEqual('12');
    });

    test('falls back to the id for an object missing from the space state', () => {
        expect(objectDisplayName(undefined, 'gone', ScanLevel.FULL)).toEqual('gone');
    });
});
