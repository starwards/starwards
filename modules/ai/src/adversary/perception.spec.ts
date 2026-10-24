import { hullRadarReach, measureWavePerception, summariseHulls } from './perception';

describe('wave-spawn perception', () => {
    it('reads the design reach of a hull as far below the 140 km spawn distance', () => {
        const reach = hullRadarReach('dragonfly-MK1');
        expect(reach.omni).toBeGreaterThan(0);
        expect(Math.max(reach.omni, reach.beam)).toBeLessThan(140_000);
    });

    it('tracks raiders from spawn, 140 km from the station they are ordered to attack', () => {
        const run = measureWavePerception(1, 20);
        expect(run.raiders.length).toBeGreaterThan(0);
        for (const raider of run.raiders) {
            expect(raider.spawnDistance).toBeGreaterThan(100_000);
            expect(raider.contact).toBeNull();
        }
        const [hull] = summariseHulls([run]);
        expect(hull.locks).toBe(0);
        expect(hull.neverLocked).toBe(hull.raiders);
    }, 120_000);
});
