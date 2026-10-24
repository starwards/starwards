import type { WaveRun } from './wave-compare';
import { baselineCache } from './baseline-cache';

const run = (crew: string, seed: number, passed: boolean): WaveRun => ({
    crew,
    seed,
    wallSeconds: 10,
    passed,
    fitness: { holdSeconds: 1, stationCapsuleLost: 0, stationArmorLost: 0, raidersKilled: 0, killsPerMinute: 0 },
});

describe('baselineCache', () => {
    it("keeps only the baseline crew's rows, by seed, across files", () => {
        const cache = baselineCache(
            [[run('guard', 1, true), run('cand', 1, false)], [run('guard', 2, false)]],
            'guard',
        );
        expect([...cache.keys()].sort()).toEqual([1, 2]);
        expect(cache.get(2)?.passed).toBe(false);
    });

    it('keeps one row for a seed cached twice with the same outcome', () => {
        expect(baselineCache([[run('guard', 1, true)], [run('guard', 1, true)]], 'guard').size).toBe(1);
    });

    it('throws when two cached rows of one seed disagree on pass (the baseline is not deterministic)', () => {
        expect(() => baselineCache([[run('guard', 1, true)], [run('guard', 1, false)]], 'guard')).toThrow(/seed 1/);
    });
});
