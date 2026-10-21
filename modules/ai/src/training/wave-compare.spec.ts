import { WaveRun, waveCompareSection } from './wave-compare';

const run = (crew: string, seed: number, holdSeconds: number, stationArmorLost: number): WaveRun => ({
    crew,
    seed,
    wallSeconds: 10,
    fitness: { holdSeconds, stationCapsuleLost: 0, stationArmorLost, raidersKilled: 2, killsPerMinute: 1 },
});

describe('waveCompareSection', () => {
    const runs = [1, 2, 3, 4, 5, 6].flatMap((seed) => [
        run('base', seed, 200, 1),
        run('cand', seed, 200, 1 - 0.1 * seed),
    ]);
    const text = waveCompareSection(runs, 'base').join('\n');

    it('pairs the candidate against the baseline per metric, with t and bootstrap intervals', () => {
        expect(text).toMatch(
            /\| cand \| stationArmorLost \| 6 \| 1\.000 \| 0\.650 \| −0\.350 \[−0\.\d+, −0\.\d+\] \| \[−0\.\d+, −0\.\d+\] \| better \|/,
        );
    });

    it('calls a metric that never moved within noise', () => {
        expect(text).toMatch(/\| cand \| holdSeconds \| 6 \| .* \| within noise \|/);
    });

    it('pairs only the seeds both crews played', () => {
        const partial = waveCompareSection([...runs, run('cand', 7, 1, 1)], 'base').join('\n');
        expect(partial).toMatch(/\| cand \| holdSeconds \| 6 \|/);
    });

    it('reports wall time per run', () => {
        expect(text).toMatch(/wall 10\.0 s per run/);
    });
});
