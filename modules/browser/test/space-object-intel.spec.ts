import { Asteroid, Faction, ScanLevel, SpaceObject, Spaceship } from '@starwards/core';
import { objectDisplayName, scanCycleTargets } from '../src/space-object-intel';

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

describe('scanCycleTargets', () => {
    const PLAYER = Faction.Gravitas;

    function at<T extends SpaceObject>(o: T, id: string, level: ScanLevel): T {
        o.id = id;
        o.scanLevels[Number(PLAYER)] = level;
        return o;
    }

    function ids(objects: SpaceObject[], selfId = 'self') {
        return scanCycleTargets(objects, PLAYER, selfId).map((o) => o.id);
    }

    test('reaches unidentified contacts of any type — the player needs to learn what a mover is', () => {
        const objects = [at(new Asteroid(), 'rock', ScanLevel.UFO), at(new Spaceship(), 'mover', ScanLevel.UFO)];
        expect(ids(objects)).toEqual(['rock', 'mover']);
    });

    test('reaches identified ships, so a ship at SNAPSHOT can be marked and rescanned', () => {
        const objects = [at(new Spaceship(), 'known', ScanLevel.SNAPSHOT)];
        expect(ids(objects)).toEqual(['known']);
    });

    test('skips an identified non-ship — a rock at BASIC has nothing left to reveal', () => {
        const objects = [at(new Asteroid(), 'rock', ScanLevel.BASIC)];
        expect(ids(objects)).toEqual([]);
    });

    test('skips the ship the station is aboard', () => {
        const objects = [at(new Spaceship(), 'self', ScanLevel.FULL)];
        expect(ids(objects, 'self')).toEqual([]);
    });
});
