import { missileShot } from './missile-range';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Pins the missile range sweep of 2026-10-18 (`npm --prefix modules/server run missile-range`,
 * seeds 1-8; table in `modules/ai/curriculum/lessons.md`). A HiExp missile reaches a still
 * dragonfly-MK1 out to 45 km, meets one flying straight at the GVTS from 70 km, and never catches one
 * running from launch at afterburner speed.
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
        'seed %i: hits a target approaching at afterburner speed launched at 70 km',
        (seed) => {
            expect(missileShot(seed, 'HiExpMissile', 70_000, 'approaching').hit).toBe(true);
        },
        120 * 1000,
    );

    it.each(SEEDS)(
        'seed %i: misses a target fleeing at afterburner speed from 2 km',
        (seed) => {
            expect(missileShot(seed, 'HiExpMissile', 2_000, 'fleeing').hit).toBe(false);
        },
        120 * 1000,
    );
});
