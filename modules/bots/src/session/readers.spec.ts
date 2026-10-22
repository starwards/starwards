import {
    Faction,
    ScanLevel,
    ShipIntelSource,
    Spaceship,
    TargetIntel,
    Vec2,
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
