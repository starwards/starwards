import { obrienFlemingConstant, raceRound, sequentialScreen, sequentialText } from './paired';

/** Archived W-waves `captain-reference-guard` pass per seed, seeds 1–128 (ceiling64 + esc6-fresh). */
const GUARD =
    '00101101111100101101110110111011110011111111010011110011111111111011101001111111011110111010011111111111101110100111111100110011'
        .split('')
        .map(Number);
/** restock-65-96: guard and restock640 on seeds 65–96. */
const GUARD_65 = '10111010011111110111101110100111'.split('').map(Number);
const RESTOCK640 = '10011111011000000111110110101011'.split('').map(Number);

function rng(seed: number) {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

describe('sequential screen', () => {
    it('uses the textbook four-look O’Brien–Fleming constant', () => {
        // equally spaced 4 looks, two-sided 5%: 2.024 (Jennison & Turnbull table 2.3)
        expect(obrienFlemingConstant([1, 2, 3, 4], 0.05)).toBeCloseTo(2.024, 1);
    });

    it('rejects guard against guard on disjoint seeds at most 10% of the time', () => {
        const r = rng(7);
        const draw = () => Array.from({ length: 192 }, () => GUARD[Math.floor(r() * GUARD.length)]);
        let rejected = 0;
        let seeds = 0;
        const trials = 2000;
        for (let i = 0; i < trials; i++) {
            const s = sequentialScreen(draw(), draw());
            if (s.decision === 'better' || s.decision === 'worse') rejected++;
            seeds += s.seeds;
        }
        expect(rejected / trials).toBeLessThanOrEqual(0.1);
        // futility stops most null screens early: well under 192 seeds on average
        expect(seeds / trials).toBeLessThan(120);
    });

    it('does not call restock640 better than guard on its 32 seeds', () => {
        const s = sequentialScreen(GUARD_65, RESTOCK640);
        expect(s.decision).toBe('futile');
        expect(s.passSeedsLost).toBe(8);
    });

    it('stops a collapse at the first look', () => {
        const s = sequentialScreen(GUARD.slice(0, 32), Array<number>(32).fill(0));
        expect(s).toMatchObject({ decision: 'worse', seeds: 32 });
    });

    it('stops a clear gain at the first look and a modest one later', () => {
        expect(sequentialScreen(Array<number>(32).fill(0), Array<number>(32).fill(1)).decision).toBe('better');
        const r = rng(3);
        const base = Array.from({ length: 192 }, () => GUARD[Math.floor(r() * GUARD.length)]);
        // the candidate rescues one failed seed in three and loses nothing
        const cand = base.map((b, i) => (b === 0 && i % 3 === 0 ? 1 : b));
        const s = sequentialScreen(base, cand);
        expect(s.decision).toBe('better');
        expect(s.seeds).toBeGreaterThan(32);
    });

    it('asks for the next look until one is reached or a boundary crossed', () => {
        expect(sequentialScreen(GUARD.slice(0, 20), GUARD.slice(20, 40))).toMatchObject({
            decision: 'continue',
            seeds: 0,
            nextLook: 32,
        });
        const s = sequentialScreen(GUARD.slice(0, 40), GUARD.slice(0, 40));
        expect(s).toMatchObject({ seeds: 32 });
        expect(sequentialText(s)).toMatch(/at 32 seeds/);
    });
});

describe('race round', () => {
    it('eliminates what is clearly worse than the reference, crowns what is clearly better, keeps the rest', () => {
        const hold = [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1];
        const round = raceRound(
            new Map([
                ['hold_here', hold],
                ['retreat', hold.map(() => 0)],
                ['close_to', hold.map(() => 1)],
                ['engage', hold.map((h, j) => (j % 4 === 0 ? 1 - h : h))],
            ]),
            'hold_here',
        );
        expect(round).toEqual({ alive: ['engage'], eliminated: ['retreat'], winners: ['close_to'] });
    });

    it('keeps everything alive without the reference', () => {
        expect(raceRound(new Map([['retreat', [0, 0, 0]]]), 'hold_here').alive).toEqual(['retreat']);
    });
});
