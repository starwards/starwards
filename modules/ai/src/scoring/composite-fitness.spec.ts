import {
    CompositeComponent,
    calibrateWeights,
    compositeCompare,
    pairedBootstrap,
    passNonInferiority,
    quantile,
} from './composite-fitness';
import { WaveRun } from '../training/wave-compare';

const run = (
    crew: string,
    seed: number,
    holdSeconds: number,
    stationCapsuleLost = 0,
    stationsLost?: number,
    survived?: number,
): WaveRun => ({
    crew,
    seed,
    wallSeconds: 1,
    fitness: { holdSeconds, stationCapsuleLost, stationArmorLost: 0, raidersKilled: 0, killsPerMinute: 0 },
    stationsLost,
    survived,
});

const seeds = Array.from({ length: 16 }, (_, i) => i + 1);

const components: CompositeComponent[] = [
    { name: 'waves-median', scenario: 'W-waves', metric: 'holdSeconds', stat: 'median', higherIsBetter: true },
    { name: 'lof', scenario: 'W-cut-lof', metric: 'stationCapsuleLost', stat: 'mean', higherIsBetter: false },
];

describe('quantile', () => {
    it('interpolates linearly between order statistics', () => {
        expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
        expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
        expect(quantile([10, 0, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0.1)).toBeCloseTo(10);
    });
});

describe('pairedBootstrap', () => {
    it('resamples seeds jointly so a constant per-seed shift has no spread', () => {
        const base = seeds.map((s) => s * 10);
        const cand = base.map((x) => x + 5);
        const r = pairedBootstrap(base, cand, (b, c) => quantile(c, 0.5) - quantile(b, 0.5));
        expect(r.estimate).toBe(5);
        expect(r.ci).toEqual([5, 5]);
        expect(r.sd).toBe(0);
    });

    it('is reproducible with its fixed seed', () => {
        const base = seeds.map((s) => (s * 37) % 11);
        const cand = seeds.map((s) => (s * 53) % 13);
        const f = (b: readonly number[], c: readonly number[]) => quantile(c, 0.5) - quantile(b, 0.5);
        expect(pairedBootstrap(base, cand, f)).toEqual(pairedBootstrap(base, cand, f));
    });
});

describe('calibrateWeights', () => {
    // crew beats idle on both; the W-waves lead is steadier (less noise) than the lof one
    const data = {
        'W-waves': seeds.flatMap((s) => [run('crew', s, 1000 + (s % 3) * 10), run('idle', s, 500 + (s % 4) * 10)]),
        'W-cut-lof': seeds.flatMap((s) => [run('crew', s, 300, s % 2 ? 0.2 : 1.6), run('idle', s, 250, 1.8)]),
    };
    const weights = calibrateWeights(components, data, 'crew', 'idle');

    it('weights components by signal-to-noise against idle, summing to 1', () => {
        const [median, lof] = weights.components;
        expect(median.snr).toBeGreaterThan(lof.snr);
        expect(lof.snr).toBeGreaterThan(0);
        expect(median.weight + lof.weight).toBeCloseTo(1);
        expect(median.weight / lof.weight).toBeCloseTo(median.snr / lof.snr);
    });

    it('a mean component SNR equals the paired mean over the SD of the differences', () => {
        const diffs = seeds.map((s) => 1.8 - (s % 2 ? 0.2 : 1.6));
        const m = diffs.reduce((a, b) => a + b) / diffs.length;
        const sd = Math.sqrt(diffs.reduce((a, d) => a + (d - m) ** 2, 0) / (diffs.length - 1));
        expect(weights.components[1].snr).toBeCloseTo(m / sd, 1);
    });

    it('gives a component that idle matches or beats no weight', () => {
        const flat = {
            ...data,
            'W-cut-lof': seeds.flatMap((s) => [run('crew', s, 300, 1.8 + (s % 2) * 0.1), run('idle', s, 300, 1.8)]),
        };
        expect(calibrateWeights(components, flat, 'crew', 'idle').components[1].weight).toBe(0);
    });
});

describe('compositeCompare', () => {
    const weights = calibrateWeights(
        components,
        {
            'W-waves': seeds.flatMap((s) => [run('crew', s, 1000 + (s % 3) * 10), run('idle', s, 500 + (s % 4) * 10)]),
            'W-cut-lof': seeds.flatMap((s) => [run('crew', s, 300, s % 2 ? 0.2 : 1.6), run('idle', s, 250, 1.8)]),
        },
        'crew',
        'idle',
    );

    it('a candidate better on every component has a composite interval above zero', () => {
        const data = {
            'W-waves': seeds.flatMap((s) => [run('base', s, 1000 + (s % 5)), run('cand', s, 1100 + (s % 7))]),
            'W-cut-lof': seeds.flatMap((s) => [run('base', s, 300, 1), run('cand', s, 300, 0.5 + (s % 3) * 0.01)]),
        };
        const r = compositeCompare(weights, data, 'base', 'cand');
        expect(r.components.map((c) => c.name)).toEqual(['waves-median', 'lof']);
        expect(r.components[0].estimate).toBeGreaterThan(0);
        expect(r.components[1].estimate).toBeGreaterThan(0); // oriented: less capsule lost is better
        expect(r.composite.ci[0]).toBeGreaterThan(0);
    });

    it('identical crews score zero', () => {
        const data = {
            'W-waves': seeds.flatMap((s) => [run('base', s, 1000 + s), run('cand', s, 1000 + s)]),
            'W-cut-lof': seeds.flatMap((s) => [run('base', s, 300, s / 10), run('cand', s, 300, s / 10)]),
        };
        expect(compositeCompare(weights, data, 'base', 'cand').composite.ci).toEqual([0, 0]);
    });
});

describe('passNonInferiority', () => {
    const passed = (crew: string, s: number) => run(crew, s, 1500, 0, 0, 3);
    const failed = (crew: string, s: number) => run(crew, s, 900, 1, 1, 1);
    const n64 = Array.from({ length: 64 }, (_, i) => i + 1);

    it('allows up to 2 seeds in 64 that the baseline passed and the candidate failed', () => {
        const runs = n64.flatMap((s) => [passed('base', s), s <= 2 ? failed('cand', s) : passed('cand', s)]);
        expect(passNonInferiority(runs, 'base', 'cand', 3)).toMatchObject({
            seeds: 64,
            worse: 2,
            better: 0,
            maxWorse: 2,
            nonInferior: true,
        });
    });

    it('fails at 3 in 64', () => {
        const runs = n64.flatMap((s) => [passed('base', s), s <= 3 ? failed('cand', s) : passed('cand', s)]);
        expect(passNonInferiority(runs, 'base', 'cand', 3).nonInferior).toBe(false);
    });

    it('scales the allowance with the seed count', () => {
        const runs = seeds.flatMap((s) => [passed('base', s), passed('cand', s)]);
        expect(passNonInferiority(runs, 'base', 'cand', 3).maxWorse).toBe(0);
    });

    it('refuses rows without stationsLost and survived', () => {
        expect(() => passNonInferiority([run('base', 1, 1), run('cand', 1, 1)], 'base', 'cand', 3)).toThrow(
            /stationsLost/,
        );
    });
});
