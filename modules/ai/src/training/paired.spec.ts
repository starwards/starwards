import { isSignificant, pairedComparison, pairedText } from './paired';

describe('paired comparison', () => {
    it('finds a small steady gain that seed-to-seed spread would hide', () => {
        const baseline = [0.1, 0.5, 0.9, 0.3, 0.7, 0.2, 0.8, 0.4];
        const candidate = baseline.map((v, i) => v + 0.05 + (i % 2 ? 0.01 : -0.01));
        const c = pairedComparison(baseline, candidate);
        expect(c).toMatchObject({ pairs: 8, wins: 8, losses: 0, ties: 0 });
        expect(c.meanDiff).toBeCloseTo(0.05, 6);
        expect(c.ci[0]).toBeGreaterThan(0.03);
        expect(c.ci[1]).toBeLessThan(0.07);
        expect(c.signP).toBeCloseTo(2 / 256, 6);
        expect(isSignificant(c)).toBe(true);
    });

    it('calls a mixed result noise', () => {
        const c = pairedComparison([0.5, 0.5, 0.5, 0.5], [0.7, 0.3, 0.6, 0.4]);
        expect(c).toMatchObject({ wins: 2, losses: 2, ties: 0, signP: 1 });
        expect(c.meanDiff).toBeCloseTo(0, 6);
        expect(isSignificant(c)).toBe(false);
    });

    it('leaves equal seeds out of the sign test', () => {
        const c = pairedComparison([1, 1, 0, 0, 1, 0], [1, 1, 1, 1, 1, 1]);
        expect(c).toMatchObject({ wins: 3, losses: 0, ties: 3 });
        expect(c.signP).toBeCloseTo(0.25, 6);
    });

    it('has no width for identical runs and no bound for a single seed', () => {
        const a = [0.2, 0.4, 0.1, 0.9];
        const b = [0.3, 0.2, 0.5, 0.8];
        expect(pairedComparison(a, a)).toMatchObject({ meanDiff: 0, ci: [0, 0], signP: 1 });
        expect(isSignificant(pairedComparison(a.slice(0, 1), b.slice(0, 1)))).toBe(false);
        // mean +0.05, sd 0.2646, t(3) 3.182
        const c = pairedComparison(a, b);
        expect(c.ci[0]).toBeCloseTo(0.05 - (3.182 * 0.2646) / 2, 3);
        expect(c.ci[1]).toBeCloseTo(0.05 + (3.182 * 0.2646) / 2, 3);
    });

    it('refuses crews that played different seed counts', () => {
        expect(() => pairedComparison([1], [1, 2])).toThrow(/same seeds/);
    });

    it('prints the difference, its interval and the seed counts', () => {
        expect(pairedText(pairedComparison([0, 0, 0, 0], [1, 1, 1, 1]), 2)).toBe(
            '+1.00 [+1.00, +1.00], 4 up / 0 down / 0 same, sign p 0.125',
        );
    });
});
