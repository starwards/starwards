import { MeterArm, armStats, goldenRule, meterReport, runsPerArm, successChecks, unpairedDiff } from './meter';
import type { WaveRun } from './wave-compare';

const run = (passed: boolean, raiders: Record<string, { model: string; killed: boolean }> = {}): WaveRun =>
    ({
        crew: 'c',
        seed: 0,
        wallSeconds: 0,
        passed,
        ammo: {
            raiders: Object.fromEntries(
                Object.entries(raiders).map(([id, r]) => [id, { model: r.model, killedAt: r.killed ? 1 : null }]),
            ),
        },
    }) as unknown as WaveRun;

const arm = (
    name: string,
    role: MeterArm['role'],
    passes: number,
    total: number,
    raiders?: Parameters<typeof run>[1],
): MeterArm => ({
    name,
    role,
    runs: Array.from({ length: total }, (_, i) => run(i < passes, raiders)),
});

describe('depth meter', () => {
    it('counts passes and gives a Wilson interval', () => {
        const s = armStats(arm('a', 'pure', 70, 100));
        expect(s.rate).toBeCloseTo(0.7, 6);
        expect(s.ci[0]).toBeLessThan(0.7);
        expect(s.ci[1]).toBeGreaterThan(0.7);
    });

    it('sizes arms: about 1000 runs for 5 pp and 250 for 10 pp at 70%', () => {
        expect(runsPerArm(0.7, 5)).toBeGreaterThan(900);
        expect(runsPerArm(0.7, 5)).toBeLessThan(1100);
        expect(runsPerArm(0.7, 10)).toBeGreaterThan(220);
        expect(runsPerArm(0.7, 10)).toBeLessThan(300);
    });

    it('treats the difference of two arms as unpaired', () => {
        const d = unpairedDiff(armStats(arm('a', 'pure', 80, 100)), armStats(arm('b', 'pure', 60, 100)));
        expect(d.diff).toBeCloseTo(0.2, 6);
        expect(d.se).toBeCloseTo(Math.sqrt(0.16 / 100 + 0.24 / 100), 6);
        expect(d.low80).toBeGreaterThan(0.1);
    });

    it('passes the success check when informed beats pure, blind sits between, control is near', () => {
        const arms = [
            arm('he', 'pure', 200, 400),
            arm('ap', 'pure', 190, 400),
            arm('blind', 'blind', 215, 400),
            arm('informed', 'informed', 240, 400),
            arm('guard', 'control', 245, 400),
        ];
        const checks = successChecks(arms);
        expect(checks.map((c) => c.ok)).toEqual([true, true, true]);
    });

    it('fails when informed does not beat a pure arm', () => {
        const checks = successChecks([arm('he', 'pure', 200, 400), arm('informed', 'informed', 205, 400)]);
        expect(checks[0].ok).toBe(false);
    });

    it('reports n/a when roles are missing', () => {
        expect(successChecks([arm('he', 'pure', 1, 2)]).map((c) => c.ok)).toEqual([null, null, null]);
    });

    it('golden rule: each pure arm must win some target type', () => {
        const he = arm('he', 'pure', 1, 2, { a: { model: 'mk1', killed: true }, b: { model: 'mk2', killed: false } });
        const ap = arm('ap', 'pure', 1, 2, { a: { model: 'mk1', killed: false }, b: { model: 'mk2', killed: true } });
        const g = goldenRule([he, ap]);
        expect(g.ok).toBe(true);
        expect(g.wins).toEqual({ he: ['mk1'], ap: ['mk2'] });
        const dominated = goldenRule([
            he,
            arm('bad', 'pure', 0, 2, { a: { model: 'mk1', killed: false }, b: { model: 'mk2', killed: false } }),
        ]);
        expect(dominated.ok).toBe(false);
        expect(dominated.losers).toEqual(['bad']);
    });

    it('renders a report with the sizing line and both checks', () => {
        const text = meterReport('ammo', [
            arm('he', 'pure', 100, 256),
            arm('informed', 'informed', 140, 256),
            arm('guard', 'control', 180, 256),
        ]);
        expect(text).toContain('# Depth meter: ammo');
        expect(text).toContain('Underpowered');
        expect(text).toContain('## Success check');
        expect(text).toContain('No raider-model data');
    });
});
