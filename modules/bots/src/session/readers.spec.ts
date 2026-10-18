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
