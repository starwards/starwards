import { bootstrap, summarize } from './sweep';

describe('branch sweep summary', () => {
    it('bootstraps a constant to itself and a mixed sample to an interval around its mean', () => {
        expect(bootstrap([1, 1, 1, 1])).toEqual([1, 1]);
        const [lo, hi] = bootstrap([0, 0, 0, 0, 1, 1, 1, 1]);
        expect(lo).toBeLessThan(0.5);
        expect(hi).toBeGreaterThan(0.5);
    });

    it('calls a state decisive only when the best action clears the default beyond its interval', () => {
        const row = (alternative: string, pass: boolean, lost: number | null) => ({
            seed: 1,
            t: 600,
            fork: 600,
            alternative,
            pass,
            firstStationLostAt: lost,
            seconds: 1000,
        });
        const rows = [
            ...Array.from({ length: 8 }, () => row('always', true, null)),
            ...Array.from({ length: 8 }, (_, i) => row('sometimes', i === 0, 900)),
        ];
        const [state] = summarize(rows, new Map([[1, { pass: false, firstStationLostAt: 800 }]]), 1500);
        expect(state.best).toBe('always');
        expect(state.decisivePass).toBe(true);
        expect(state.decisiveLost).toBe(true);
        const [weak] = summarize(rows.slice(8), new Map([[1, { pass: false, firstStationLostAt: 800 }]]), 1500);
        expect(weak.decisivePass).toBe(false);
    });
});
