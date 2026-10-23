import {
    CapsuleTierTracker,
    Faction,
    HullStatus,
    ScanLevel,
    ShipIntelSource,
    Spaceship,
    TargetIntel,
    Vec2,
    hullStatusList,
    makeShipState,
    shipConfigurations,
} from '@starwards/core/internal';
import { StationSession, widgetReaders } from '..';

function helmsStats(targetId: string | null) {
    const session = {
        stationName: 'helms',
        shipDriver: { state: { smartPilot: {}, maneuvering: {}, spaceship: {}, weaponsTarget: { targetId } } },
    } as unknown as StationSession;
    return widgetReaders['helms-stats']?.(session) as Record<string, unknown>;
}

describe('helms-stats panel', () => {
    // helms draws the weapons lock as the line from the ship to its target, so its panel carries it too
    it('shows the weapons lock', () => {
        expect(helmsStats('enemy')).toHaveProperty('targetLocked', true);
    });

    it('shows no lock without a weapons target', () => {
        expect(helmsStats(null)).toHaveProperty('targetLocked', false);
    });
});

describe('target-intel panel', () => {
    function read(scanLevel: ScanLevel, source: ShipIntelSource | undefined) {
        const target = new Spaceship().init('enemy', Vec2.make({ x: 0, y: 0 }), 'dragonfly-MK1', Faction.Raiders);
        target.scanLevels[Number(Faction.Gravitas)] = scanLevel;
        const session = {
            viewFaction: Faction.Gravitas,
            shipIntel: source,
            shipDriver: { state: { signalsTargetId: 'enemy' } },
            spaceDriver: { state: { get: (id: string) => (id === 'enemy' ? target : undefined) } },
        } as unknown as StationSession;
        return widgetReaders['target-intel']?.(session) as TargetIntel & { targetId: string | null };
    }
    const enemyState = makeShipState('enemy', shipConfigurations['dragonfly-MK1']);
    const source: ShipIntelSource = {
        live: () => enemyState,
        snapshot: () => ({ state: enemyState, ageSeconds: 9 }),
    };

    it.each([ScanLevel.UFO, ScanLevel.BASIC])('withholds design and armor at %s', (level) => {
        const panel = read(level, source);
        expect(panel.targetId).toBe('enemy');
        expect(panel.intel).toBe('NONE');
        expect(panel.design).toBeUndefined();
    });

    it('serves live design and armor at FULL', () => {
        const panel = read(ScanLevel.FULL, source);
        expect(panel.intel).toBe('LIVE');
        expect(panel.design?.armor.plates).toHaveLength(enemyState.armor.numberOfPlates);
    });

    it('serves the snapshot at SNAPSHOT', () => {
        const panel = read(ScanLevel.SNAPSHOT, source);
        expect(panel.intel).toBe('SNAPSHOT');
        expect(panel.ageSeconds).toBe(9);
    });

    it('reads PENDING without a source', () => {
        expect(read(ScanLevel.FULL, undefined).intel).toBe('PENDING');
    });
});

describe('hull-status panel', () => {
    const states = {
        ally: makeShipState('ally', shipConfigurations['dragonfly-MK1']),
        full: makeShipState('full', shipConfigurations['dragonfly-MK1']),
        snap: makeShipState('snap', shipConfigurations['dragonfly-MK1']),
        basic: makeShipState('basic', shipConfigurations['dragonfly-MK1']),
    };
    states.ally.capsule.integrity = 0.3;
    states.snap.capsule.integrity = 0.1;
    const source: ShipIntelSource = {
        live: (s) => states[s.id as keyof typeof states],
        snapshot: (s) => ({ state: states[s.id as keyof typeof states], ageSeconds: 12 }),
    };

    function ship(id: string, faction: Faction, scanLevel: ScanLevel) {
        const s = new Spaceship().init(id, Vec2.make({ x: 0, y: 0 }), 'dragonfly-MK1', faction);
        s.callsign = id;
        s.scanLevels[Number(Faction.Gravitas)] = scanLevel;
        return s;
    }
    const objects = [
        ship('self', Faction.Gravitas, ScanLevel.BASIC),
        ship('ally', Faction.Gravitas, ScanLevel.BASIC),
        ship('full', Faction.Raiders, ScanLevel.FULL),
        ship('snap', Faction.Raiders, ScanLevel.SNAPSHOT),
        ship('basic', Faction.Raiders, ScanLevel.BASIC),
    ];
    const session = {
        viewFaction: Faction.Gravitas,
        shipIntel: source,
        now: () => 0,
        hullTiers: new CapsuleTierTracker(),
        shipDriver: { id: 'self' },
        spaceDriver: { state: objects },
    } as unknown as StationSession;

    // the bot panel and the browser's Signals list are the same core predicate
    it('lists exactly what core hullStatusList lists for the same observer', () => {
        const panel = widgetReaders['hull-status']?.(session);
        expect(panel).toEqual(hullStatusList(objects, Faction.Gravitas, 'self', source, new CapsuleTierTracker(), 0));
    });

    it('shows allies live, FULL live, SNAPSHOT frozen with age, nothing below', () => {
        const panel = widgetReaders['hull-status']?.(session) as HullStatus[];
        expect(panel.map((r) => [r.id, r.intel, r.capsule])).toEqual([
            ['ally', 'LIVE', 'critical'],
            ['full', 'LIVE', 'intact'],
            ['snap', 'SNAPSHOT', 'failing'],
        ]);
        expect(panel[2].ageSeconds).toBe(12);
    });
});
