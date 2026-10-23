import { Asteroid, Derelict, Faction, Projectile, ScanLevel, SpaceObject, Spaceship, Vec2 } from '@starwards/core';
import { missileTargetLines, objectDisplayName, scanCycleTargets } from '../src/client/space-object-intel';

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

    function derelict(id: string, callsign: string) {
        return new Derelict().init(id, Vec2.make({ x: 0, y: 0 }), 10, Faction.Gravitas, callsign, 0);
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

    test('a derelict keeps its dead ship callsign, marked as a wreck so it never reads as the live ship', () => {
        expect(objectDisplayName(derelict('12', 'Dragonfly'), '12', ScanLevel.BASIC)).toEqual('Dragonfly (wreck)');
    });

    test('a callsign-less derelict falls back to the type', () => {
        expect(objectDisplayName(derelict('12', ''), '12', ScanLevel.FULL)).toEqual('Derelict 12');
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

    test('reaches an identified missile until its warhead is read (M4.26)', () => {
        const objects = [
            at(new Projectile('FragMissile'), 'msl', ScanLevel.BASIC),
            at(new Projectile('ElecMissile'), 'read', ScanLevel.FULL),
            at(new Projectile('HiExpShell'), 'shell', ScanLevel.BASIC),
        ];
        expect(ids(objects)).toEqual(['msl']);
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

describe('missileTargetLines', () => {
    function missile(id: string, targetId: string | null, level: ScanLevel) {
        const o = new Projectile();
        o.id = id;
        o.model = 'HiExpShell';
        (o as { faction: Faction }).faction = Faction.Raiders;
        o.targetId = targetId;
        o.position = new Vec2(1, 2);
        o.scanLevels[Number(Faction.Gravitas)] = level;
        return o;
    }
    const target = new Spaceship();
    target.id = 't';
    target.position = new Vec2(10, 20);
    const lookup = (id: string) => (id === 't' ? target : undefined);

    test('draws from a FULL-scanned missile to its current target', () => {
        const m = missile('m', 't', ScanLevel.FULL);
        m.model = 'HiExpMissile';
        expect(missileTargetLines([m], lookup, Faction.Gravitas)).toEqual([[m.position, target.position]]);
    });

    test('draws to the target even when the player cannot see or scan it: a FULL scan reads the missile guidance', () => {
        const hidden = new Spaceship();
        hidden.id = 'hidden';
        hidden.faction = Faction.Raiders;
        hidden.position = new Vec2(900, 900);
        const m = Object.assign(missile('m', 'hidden', ScanLevel.FULL), { model: 'HiExpMissile' as const });
        expect(missileTargetLines([m], () => hidden, Faction.Gravitas)).toEqual([[m.position, hidden.position]]);
    });

    test('skips missiles below FULL, without a live target, and non-missile projectiles', () => {
        const snapshot = Object.assign(missile('a', 't', ScanLevel.SNAPSHOT), { model: 'HiExpMissile' as const });
        const noTarget = Object.assign(missile('b', null, ScanLevel.FULL), { model: 'HiExpMissile' as const });
        const goneTarget = Object.assign(missile('c', 'gone', ScanLevel.FULL), { model: 'HiExpMissile' as const });
        const shell = missile('d', 't', ScanLevel.FULL);
        expect(missileTargetLines([snapshot, noTarget, goneTarget, shell], lookup, Faction.Gravitas)).toEqual([]);
    });
});
