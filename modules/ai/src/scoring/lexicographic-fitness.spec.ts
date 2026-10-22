import { compareLexicographic, lexicographicFitness } from './lexicographic-fitness';
import { WaveRun } from '../training/wave-compare';

const run = (crew: string, seed: number, pass: boolean, holdSeconds: number, wave3Damage = 0): WaveRun => ({
    crew,
    seed,
    wallSeconds: 1,
    fitness: { holdSeconds, stationCapsuleLost: 0, stationArmorLost: 0, raidersKilled: 0, killsPerMinute: 0 },
    stationsLost: pass ? 0 : 1,
    survived: pass ? 3 : 2,
    ammo: { stationDamageByWave: { 3: wave3Damage } } as unknown as WaveRun['ammo'],
});

describe('lexicographicFitness', () => {
    it('counts passes, averages capped hold over failed runs, averages wave-3 station damage', () => {
        const f = lexicographicFitness(
            [run('a', 1, true, 1700, 10), run('a', 2, false, 900, 20), run('a', 3, false, 2000, 30), run('b', 1, false, 1)],
            'a',
        );
        expect(f).toEqual({ passes: 1, failHoldSeconds: (900 + 1500) / 2, wave3StationDamage: 20 });
    });

    it('censors at 1500 when every run passed', () => {
        expect(lexicographicFitness([run('a', 1, true, 1700)], 'a').failHoldSeconds).toBe(1500);
    });
});

describe('compareLexicographic', () => {
    const f = (passes: number, failHoldSeconds: number, wave3StationDamage: number) => ({
        passes,
        failHoldSeconds,
        wave3StationDamage,
    });
    it('orders by passes, then later first loss, then less wave-3 damage', () => {
        const sorted = [f(5, 1400, 0), f(6, 100, 9), f(5, 1400, 3), f(5, 1450, 99)].sort(compareLexicographic);
        expect(sorted).toEqual([f(6, 100, 9), f(5, 1450, 99), f(5, 1400, 0), f(5, 1400, 3)]);
    });
});
