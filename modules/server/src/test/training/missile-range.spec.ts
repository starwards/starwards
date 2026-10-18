import { missileShot } from './missile-range';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Pins the missile range sweep of 2026-10-18 (`npm --prefix modules/server run missile-range`,
 * seeds 1-8; table in `modules/ai/curriculum/lessons.md`). A HiExp missile flies 600 m/s, the
 * dragonfly-MK1's cruise speed: it reaches a still target out to 45 km, and never closes on one
 * that runs from launch.
 */
describe('missile range: one GVTS HiExp missile vs dragonfly-MK1', () => {
    it.each(SEEDS)(
        'seed %i: hits a still target launched at 45 km',
        (seed) => {
            expect(missileShot(seed, 'HiExpMissile', 45_000, 'still').hit).toBe(true);
        },
        120 * 1000,
    );

    it.each(SEEDS)(
        'seed %i: misses a target fleeing at cruise speed from 2 km',
        (seed) => {
            expect(missileShot(seed, 'HiExpMissile', 2_000, 'fleeing-cruise').hit).toBe(false);
        },
        120 * 1000,
    );
});
