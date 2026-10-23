import { Asteroid, Faction, ScanLevel, ShipState, Spaceship, demoShip, makeShipState } from '@starwards/core';
import {
    CAPSULE_TIERS,
    CapsuleTierTracker,
    HULL_STATUS_TUNING,
    capsuleTier,
    hullStatusList,
} from '../src/client/hull-status';

import { ShipIntelSource } from '../src/client/space-object-intel';

describe('capsuleTier', () => {
    test.each([
        [1, 'intact'],
        [0.76, 'intact'],
        [0.75, 'damaged'],
        [0.41, 'damaged'],
        [0.4, 'critical'],
        [0.16, 'critical'],
        [0.15, 'failing'],
        [0, 'failing'],
    ])('integrity %p reads %p', (integrity, tier) => {
        expect(capsuleTier(integrity)).toEqual(tier);
    });

    test('the tier table is ordered best first, one row per tier', () => {
        expect(CAPSULE_TIERS.map((t) => t.tier)).toEqual(['intact', 'damaged', 'critical', 'failing']);
    });
});

describe('CapsuleTierTracker', () => {
    const { dwellSeconds, returnMargin } = HULL_STATUS_TUNING;

    test('settles on the first reading at once', () => {
        expect(new CapsuleTierTracker().settle('a', 0.5, 0)).toEqual('damaged');
    });

    test('a worse tier is taken only after it held for the dwell', () => {
        const t = new CapsuleTierTracker();
        t.settle('a', 0.9, 0);
        expect(t.settle('a', 0.7, 1)).toEqual('intact');
        expect(t.settle('a', 0.7, 1 + dwellSeconds - 0.1)).toEqual('intact');
        expect(t.settle('a', 0.7, 1 + dwellSeconds)).toEqual('damaged');
    });

    test('a value oscillating at a threshold never changes the settled tier', () => {
        const t = new CapsuleTierTracker();
        t.settle('a', 0.76, 0);
        let now = 0;
        for (let i = 0; i < 20; i++) {
            now += 0.5;
            expect(t.settle('a', i % 2 ? 0.76 : 0.74, now)).toEqual('intact');
        }
    });

    test('a return to a better tier needs the margin past the threshold', () => {
        const t = new CapsuleTierTracker();
        t.settle('a', 0.5, 0);
        expect(t.settle('a', 0.75 + returnMargin / 2, 1)).toEqual('damaged');
        expect(t.settle('a', 0.75 + returnMargin / 2, 1 + dwellSeconds)).toEqual('damaged');
        t.settle('a', 0.75 + returnMargin + 0.01, 10);
        expect(t.settle('a', 0.75 + returnMargin + 0.01, 10 + dwellSeconds)).toEqual('intact');
    });

    test('forgets subjects not seen in a pass', () => {
        const t = new CapsuleTierTracker();
        t.settle('a', 0.9, 0);
        t.retain(new Set());
        expect(t.settle('a', 0.5, 1)).toEqual('damaged');
    });
});

describe('hullStatusList', () => {
    const PLAYER = Faction.Gravitas;
    const ENEMY = Faction.Raiders;

    function ship(id: string, faction: Faction, scan: ScanLevel = ScanLevel.UFO) {
        const s = new Spaceship();
        s.id = id;
        s.callsign = id;
        s.faction = faction;
        s.scanLevels[Number(PLAYER)] = scan;
        return s;
    }

    function state(integrity: number): ShipState {
        const s = makeShipState('x', demoShip);
        s.capsule.integrity = integrity;
        return s;
    }

    const states: Record<string, ShipState> = {};
    const source: ShipIntelSource = {
        live: (s) => states[s.id],
        snapshot: (s) => (states[`${s.id}@snap`] ? { state: states[`${s.id}@snap`], ageSeconds: 40 } : undefined),
    };

    function list(objects: (Spaceship | Asteroid)[], faction: Faction | undefined = PLAYER) {
        return hullStatusList(objects, faction, 'self', source, new CapsuleTierTracker(), 0);
    }

    beforeEach(() => {
        for (const k of Object.keys(states)) delete states[k];
    });

    test('an ally reads live telemetry whatever its scan level', () => {
        states.ally = state(0.3);
        const [row] = list([ship('ally', PLAYER, ScanLevel.UFO)]);
        expect(row).toMatchObject({ id: 'ally', allied: true, intel: 'LIVE', capsule: 'critical' });
        expect(row.hullPercent).toBeGreaterThanOrEqual(0);
    });

    test('a FULL-scanned enemy reads live; a SNAPSHOT one reads frozen with its age', () => {
        states.full = state(1);
        states['snap@snap'] = state(0.1);
        const rows = list([ship('full', ENEMY, ScanLevel.FULL), ship('snap', ENEMY, ScanLevel.SNAPSHOT)]);
        expect(rows).toEqual([
            expect.objectContaining({ id: 'full', allied: false, intel: 'LIVE', capsule: 'intact' }),
            expect.objectContaining({ id: 'snap', intel: 'SNAPSHOT', ageSeconds: 40, capsule: 'failing' }),
        ]);
    });

    test('nothing below SNAPSHOT is listed, and nothing that is no ship', () => {
        states.basic = state(1);
        const rock = new Asteroid();
        rock.id = 'rock';
        rock.scanLevels[Number(PLAYER)] = ScanLevel.FULL;
        expect(list([ship('basic', ENEMY, ScanLevel.BASIC), ship('ufo', ENEMY), rock])).toEqual([]);
    });

    test('the own ship is not listed', () => {
        states.self = state(1);
        expect(list([ship('self', PLAYER)])).toEqual([]);
    });

    test('a subject whose source has not delivered reads PENDING without values', () => {
        expect(list([ship('ally', PLAYER)])).toEqual([{ id: 'ally', name: 'ally', allied: true, intel: 'PENDING' }]);
    });

    test('allies come first', () => {
        states.e = state(1);
        states.a = state(1);
        expect(list([ship('e', ENEMY, ScanLevel.FULL), ship('a', PLAYER)]).map((r) => r.id)).toEqual(['a', 'e']);
    });

    test('rows carry the tier, never the raw capsule integrity', () => {
        states.ally = state(0.5);
        expect(Object.keys(list([ship('ally', PLAYER)])[0]).sort()).toEqual(
            ['allied', 'capsule', 'hullPercent', 'id', 'intel', 'name'].sort(),
        );
    });
});
