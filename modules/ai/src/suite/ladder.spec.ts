import { loadBenchmark } from '../benchmarks/benchmark';
import { loadLadder } from './ladder';
import { trainingScenarios } from '@starwards/server/src/test/training/training-scenarios';

describe('curriculum ladder', () => {
    const ladder = loadLadder();

    it('every built level names rungs and benchmarks that exist', () => {
        for (const level of ladder.levels.filter((l) => l.status === 'built')) {
            for (const rung of level.rungs) expect(trainingScenarios).toHaveProperty([rung]);
            for (const bench of level.benchmarks) expect(loadBenchmark(bench).name).toBe(bench);
        }
    });

    it('placeholders play nothing, so the suite has nothing to skip silently', () => {
        for (const level of ladder.levels.filter((l) => l.status === 'placeholder')) {
            expect([...level.rungs, ...level.benchmarks]).toEqual([]);
        }
    });

    it('level 0 carries every station benchmark as a skill check', () => {
        const stations = new Set(ladder.levels[0].benchmarks.map((b) => loadBenchmark(b).station));
        expect([...stations].sort()).toEqual(['engineer', 'helms', 'signals', 'weapons']);
    });
});
