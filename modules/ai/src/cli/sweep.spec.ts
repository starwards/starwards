import { bootstrap, raceAlive, reseedKey, summarize } from './sweep';
import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { withReseed } from '../branching/fork';

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

describe('reseeded rollouts', () => {
    it('keys each rollout of a state apart, the same for every alternative, and apart again per base', () => {
        const keys = Array.from({ length: 8 }, (_, j) => reseedKey(7, 900, j, 0));
        expect(new Set(keys).size).toBe(8);
        expect(reseedKey(7, 900, 3, 0)).toBe(keys[3]);
        expect(reseedKey(7, 900, 3, 1)).not.toBe(keys[3]);
        expect(reseedKey(8, 900, 3, 0)).not.toBe(keys[3]);
    });

    it('reseeds the game once, at the first tick at or after the fork, after the intervention script', () => {
        const calls: string[] = [];
        const game = (seconds: number) =>
            ({
                seconds,
                reseed: (key: number, which: object) => calls.push(`${seconds} reseed ${key} ${JSON.stringify(which)}`),
            }) as unknown as HeadlessGame;
        const { script } = withReseed({ script: (g) => void calls.push(`${g.seconds} script`) }, 10, 42, 'waves')!;
        for (const t of [9.5, 10.01, 10.5]) script!(game(t));
        expect(calls).toEqual([
            '9.5 script',
            '10.01 script',
            '10.01 reseed 42 {"die":false,"map":true}',
            '10.5 script',
        ]);
    });

    it('counts distinct futures per state, and indexes a race by rollout when the fork does not move', () => {
        const row = (alternative: string, j: number, whole: string, pass: boolean) => ({
            seed: 1,
            t: 600,
            fork: 600,
            rollout: j,
            alternative,
            pass,
            firstStationLostAt: null,
            seconds: 1,
            whole,
        });
        const rows = [
            ...[0, 1, 2, 3].map((j) => row('hold_here', j, `h${j % 2}`, j % 2 === 0)),
            ...[0, 1, 2, 3].map((j) => row('retreat', j, `r${j}`, false)),
        ];
        const [state] = summarize(rows, new Map([[1, { pass: false, firstStationLostAt: null }]]), 1500);
        expect(state.distinct).toBe(2);
        expect(state.n).toBe(4);
        expect(raceAlive(rows, { seed: 1, t: 600, alternative: 'hold_here' }, 4, 0)).toBe(true);
    });
});
