import { BenchResult, LevelResult, RungResult, compareLevel, killNoiseFloor, levelAccepted } from './regression';
import { ladderSchema } from './ladder';

const rule = { z: 1.645, medianSlowdown: 0.25, minKillsForMedian: 3, minScoreDrop: 0.05 };
const rung = (kills: number, runs: number, medianSeconds: number | null): RungResult => ({
    kind: 'rung',
    name: 'T0',
    runs,
    kills,
    medianSeconds,
    refused: 0,
    fallbacks: 0,
});
const bench = (meanScore: number, sdScore: number, runs = 8): BenchResult => ({
    kind: 'benchmark',
    name: 'helms-tag',
    brain: 'helms@1/reference',
    runs,
    meanScore,
    sdScore,
    refused: 0,
    fallbacks: 0,
});
const level = (...items: LevelResult['items']): LevelResult => ({
    id: 'L0',
    seeds: { first: 1, count: 8 },
    timeoutSeconds: 180,
    items,
});
const verdict = (base: LevelResult['items'][number], now: LevelResult['items'][number]) =>
    compareLevel(level(base), level(now), rule)[0].status;

describe('regression rule', () => {
    it('one miss after a perfect 8/8 is seed noise, two are a regression', () => {
        expect(verdict(rung(8, 8, 80), rung(7, 8, 80))).toBe('ok');
        expect(verdict(rung(8, 8, 80), rung(6, 8, 80))).toBe('regressed');
    });

    it('a baseline without kills cannot regress on kills', () => {
        expect(killNoiseFloor(0, 8, 8, rule.z)).toBeLessThan(0);
        expect(verdict(rung(0, 8, null), rung(0, 8, null))).toBe('ok');
    });

    it('12/16 to 9/16 is within noise at 16 seeds', () => {
        expect(verdict(rung(12, 16, 40), rung(9, 16, 40))).toBe('ok');
        expect(verdict(rung(12, 16, 40), rung(7, 16, 40))).toBe('regressed');
    });

    it('a median slower by more than the allowed share regresses, given enough kills on both sides', () => {
        expect(verdict(rung(8, 8, 80), rung(8, 8, 99))).toBe('ok');
        expect(verdict(rung(8, 8, 80), rung(8, 8, 101))).toBe('regressed');
        expect(verdict(rung(2, 8, 80), rung(2, 8, 200))).toBe('ok');
    });

    it('a benchmark score drop counts only beyond both the floor and the seed spread', () => {
        expect(verdict(bench(0.8, 0), bench(0.76, 0))).toBe('ok');
        expect(verdict(bench(0.8, 0), bench(0.7, 0))).toBe('regressed');
        expect(verdict(bench(0.8, 0.2), bench(0.7, 0.2))).toBe('ok');
    });

    it('other seeds or timeout are incomparable, a missing item is new', () => {
        const other = { ...level(rung(8, 8, 80)), timeoutSeconds: 120 };
        expect(compareLevel(other, level(rung(1, 8, 80)), rule)[0].status).toBe('incomparable');
        expect(compareLevel(undefined, level(rung(1, 8, 80)), rule)[0].status).toBe('new');
    });

    it('a level is accepted when every rung reaches its kill rate and median', () => {
        const [l0] = ladderSchema.parse({
            regression: rule,
            levels: [
                {
                    id: 'L0',
                    axis: 'baseline',
                    changed: 'start',
                    status: 'built',
                    rungs: ['T0'],
                    benchmarks: [],
                    seeds: { first: 1, count: 8 },
                    timeoutSeconds: 180,
                    plateau: { metric: 'kills', versions: 2 },
                    accept: { killRate: 0.875, medianSeconds: 120 },
                },
            ],
        }).levels;
        expect(levelAccepted(l0, level(rung(7, 8, 100), bench(0, 0)))).toBe(true);
        expect(levelAccepted(l0, level(rung(6, 8, 100)))).toBe(false);
        expect(levelAccepted(l0, level(rung(8, 8, 130)))).toBe(false);
    });
});
