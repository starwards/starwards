import { bootstrap, raceAlive, summarize } from './sweep';

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

describe('racing sweep', () => {
    const rows = (alternative: string, passes: number[]) =>
        passes.map((p, j) => ({
            seed: 1,
            t: 600,
            fork: 600 + 2 * j,
            alternative,
            pass: !!p,
            firstStationLostAt: null,
            seconds: 1,
        }));
    const hold = [1, 0, 1, 1, 0, 1, 1, 0];
    const state = [
        ...rows('hold_here', hold),
        ...rows(
            'retreat',
            hold.map(() => 0),
        ),
        ...rows('close_to', [1, 0, 1, 0, 0, 1, 1, 0]),
    ];
    const alive = (alternative: string) => raceAlive(state, { seed: 1, t: 600, alternative }, 8, 2);

    it('drops an alternative clearly worse than hold_here and keeps a close one racing with hold_here', () => {
        expect(alive('retreat')).toBe(false);
        expect(alive('close_to')).toBe(true);
        expect(alive('hold_here')).toBe(true);
    });
});
