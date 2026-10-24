import { WAVE_METRICS, bootstrapMeanCI, waveFitness } from './wave-fitness';

import { WaveOutcome } from '@starwards/server/src/test/training/wave-rung';

const outcome = (o: Partial<WaveOutcome> = {}): WaveOutcome => ({
    passWaves: Infinity,
    survived: 0,
    reached: 1,
    stationsLost: 0,
    firstStationLostAt: null,
    raidersKilled: 3,
    raidersSpawned: 4,
    gvtsHealth: 1,
    passedAt: null,
    endSeconds: 240,
    stationCapsuleLost: 0.25,
    stationArmorLost: 0.5,
    ...o,
});

describe('waveFitness', () => {
    it('holds for the whole run when no station is lost', () => {
        expect(waveFitness(outcome())).toEqual({
            holdSeconds: 240,
            stationCapsuleLost: 0.25,
            stationArmorLost: 0.5,
            raidersKilled: 3,
            killsPerMinute: 0.75,
        });
    });

    it('holds until the first station is lost', () => {
        expect(waveFitness(outcome({ firstStationLostAt: 100, stationsLost: 1 })).holdSeconds).toBe(100);
    });

    it('falls back to the run seconds for results without an end time', () => {
        const { endSeconds: _, ...old } = outcome();
        expect(waveFitness(old, 120).killsPerMinute).toBeCloseTo(1.5);
    });

    it('names a better direction for every metric', () => {
        expect(WAVE_METRICS.map((m) => [m.name, m.higherIsBetter])).toEqual([
            ['holdSeconds', true],
            ['stationCapsuleLost', false],
            ['stationArmorLost', false],
            ['raidersKilled', true],
            ['killsPerMinute', true],
        ]);
    });
});

describe('bootstrapMeanCI', () => {
    it('is the point when every value is equal', () => {
        expect(bootstrapMeanCI([2, 2, 2, 2])).toEqual([2, 2]);
    });

    it('brackets the mean and leaves zero out of a clearly positive sample', () => {
        const xs = [1, 2, 3, 2, 1.5, 2.5, 3, 1, 2, 2];
        const [low, high] = bootstrapMeanCI(xs);
        expect(low).toBeGreaterThan(0);
        expect(low).toBeLessThan(2);
        expect(high).toBeGreaterThan(2);
        expect(high).toBeLessThan(3);
    });

    it('is reproducible: seeded resampling', () => {
        const xs = [-1, 4, 0.5, 2, -3, 1];
        expect(bootstrapMeanCI(xs)).toEqual(bootstrapMeanCI(xs));
    });

    it('covers zero for a sample centred on it', () => {
        const [low, high] = bootstrapMeanCI([-2, 1, -1, 2, 0.5, -0.5, 1.5, -1.5]);
        expect(low).toBeLessThan(0);
        expect(high).toBeGreaterThan(0);
    });
});
