import { gunneryFractions, median } from './gunnery-metrics';

describe('median', () => {
    it('is the middle value of an odd count, in any order', () => {
        expect(median([9, 1, 5])).toBe(5);
    });

    it('is the mean of the middle two of an even count', () => {
        expect(median([4, 1, 3, 2])).toBe(2.5);
    });

    it('ignores non-finite values', () => {
        expect(median([NaN, 2, Infinity, 4, 6])).toBe(4);
    });

    it('is NaN with no finite values', () => {
        expect(median([])).toBeNaN();
        expect(median([NaN])).toBeNaN();
    });
});

describe('gunneryFractions', () => {
    it('is the share of samples in range and in the kill zone', () => {
        expect(
            gunneryFractions([
                { inRange: true, inKillZone: true },
                { inRange: true, inKillZone: false },
                { inRange: false, inKillZone: false },
                { inRange: true, inKillZone: false },
            ]),
        ).toEqual({ inRangeFraction: 0.75, killZoneFraction: 0.25 });
    });

    it('is NaN without samples', () => {
        expect(gunneryFractions([])).toEqual({ inRangeFraction: NaN, killZoneFraction: NaN });
    });
});
