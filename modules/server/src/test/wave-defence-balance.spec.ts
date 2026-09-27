import { DEFAULT_WAVE_TUNING, WAVE_INTERVAL_SECONDS } from '../scenarios/wave-defence';
import { SweepCell, runWaveDefence, sweepToMarkdown } from './wave-defence-balance-harness';
import { SERVER_TICK_HZ } from './headless-game';

const HZ = SERVER_TICK_HZ;

describe('wave-defence balance harness', () => {
    it('runs wave-defence headless with the player proxy and records wave 1', () => {
        const result = runWaveDefence({ seed: 1, maxSimSeconds: 60, hz: HZ });
        expect(result.waves[0]).toMatchObject({ wave: 1, hulls: 2, targetStationId: 'station-large' });
        expect(result.raiders.map((r) => r.model)).toEqual(['dragonfly-MK1', 'dragonfly-MK1']);
        expect(result.defeated).toBe(false);
    });

    // Measured 2026-09-26: the crewed standoff GVTS, with its engineer on the real reactor, kills a
    // wave-1 raider in 11/16 seeds (seeds 1-16, 960 sim-s = waves 1-2, 60 Hz); seed 1 kills at 341 s.
    // Minutes of game time at 60 Hz. A kill is a combat death, however the kill path works, so this
    // survives the capsule.
    it(
        'wave 1: the crewed standoff GVTS kills at least one raider (seeded; 11/16 seeds measured)',
        () => {
            const result = runWaveDefence({
                seed: 1,
                proxy: 'standoff-missiles',
                maxSimSeconds: WAVE_INTERVAL_SECONDS,
            });
            expect(result.raiders.filter((r) => r.wave === 1 && r.fate === 'killed').length).toBeGreaterThan(0);
        },
        10 * 60 * 1000,
    );

    it('sweepToMarkdown tabulates survival, each wave and each hull, per tuning cell', () => {
        const maxSimSeconds = 150;
        const hz = 10;
        const cells: SweepCell[] = [
            { label: 'default', tuning: DEFAULT_WAVE_TUNING },
            { label: 'interval 120s', tuning: { ...DEFAULT_WAVE_TUNING, waveIntervalSeconds: 120 } },
        ].map(({ label, tuning }) => ({
            label,
            tuning,
            runs: [runWaveDefence({ seed: 1, tuning, maxSimSeconds, hz })],
        }));

        const report = sweepToMarkdown(cells, maxSimSeconds, hz);

        expect(report).toContain(`${hz} Hz, cap ${maxSimSeconds} sim-s per run`);
        expect(report).toContain('| default | 1 | 0 | 1 / 1.0 / 1 |');
        expect(report).toContain('| interval 120s | 1 | 0 | 2 / 2.0 / 2 |');
        const perWave = (label: string) => report.split(`### ${label}\n`)[1].split('\n\n')[0].split('\n');
        expect(perWave('default').filter((row) => /^\| \d/.test(row))).toEqual([
            expect.stringMatching(/^\| 1 \| 10 \| 2\.0 \| 1 \| 150 \| /),
        ]);
        expect(perWave('interval 120s').filter((row) => /^\| \d/.test(row))).toEqual([
            expect.stringMatching(/^\| 1 \| 10 \| 2\.0 \| 1 \| 120 \| /),
            expect.stringMatching(/^\| 2 \| 25 \| 4\.0 \| 1 \| 30 \| /),
        ]);
        expect(report).toMatch(/^\| dragonfly-MK1 \| \d+ \|/m);
    });
});
