import { DEFAULT_WAVE_TUNING, WAVE_INTERVAL_SECONDS, WaveDefenceTuning } from '../scenarios/wave-defence';
import { SweepCell, runWaveDefence, sweepToMarkdown } from './wave-defence-balance-harness';
import { SERVER_TICK_HZ } from './headless-game';

import fs from 'fs';
import path from 'path';

const REPORT_PATH = path.join(__dirname, 'wave-defence-balance-report.md');
const SWEEP_SIM_SECONDS = 2400;
const SWEEP_SEEDS = [1, 2, 3];
const HZ = SERVER_TICK_HZ;

const scaled = (factor: number, models: (keyof WaveDefenceTuning['hullScores'])[]): WaveDefenceTuning['hullScores'] => {
    const scores = { ...DEFAULT_WAVE_TUNING.hullScores };
    for (const model of models) {
        scores[model] = Math.round(scores[model] * factor);
    }
    return scores;
};

/** v1 axes: budget exponent x wave interval at default prices, plus two hull-price variants at the default exponent. */
const SWEEP: { label: string; tuning: WaveDefenceTuning }[] = [
    ...[1.1, 1.3, 1.5].flatMap((budgetExponent) =>
        [240, 480].map((waveIntervalSeconds) => ({
            label: `exp ${budgetExponent}, interval ${waveIntervalSeconds}s`,
            tuning: { ...DEFAULT_WAVE_TUNING, budgetExponent, waveIntervalSeconds },
        })),
    ),
    {
        label: 'exp 1.3, heavies x1.5',
        tuning: { ...DEFAULT_WAVE_TUNING, hullScores: scaled(1.5, ['predator', 'glaive', 'cataphract']) },
    },
    {
        label: 'exp 1.3, dragonflies x1.5',
        tuning: { ...DEFAULT_WAVE_TUNING, hullScores: scaled(1.5, ['dragonfly-MK1', 'dragonfly-MK2']) },
    },
];

describe('wave-defence balance harness', () => {
    it('runs wave-defence headless with the player proxy and records wave 1', () => {
        const result = runWaveDefence({ seed: 1, maxSimSeconds: 60, hz: HZ });
        expect(result.waves[0]).toMatchObject({ wave: 1, hulls: 2, targetStationId: 'station-large' });
        expect(result.raiders.map((r) => r.model)).toEqual(['dragonfly-MK1', 'dragonfly-MK1']);
        expect(result.defeated).toBe(false);
    });

    // Measured 2026-09-25: the crewed standoff GVTS, with its engineer on the real reactor, kills a
    // wave-1 raider in 11/16 seeds (waves 1-2, 60 Hz); seed 1 kills at 341 s. Minutes of game time at
    // 60 Hz. A kill is a combat death, however the kill path works, so this survives the capsule.
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

    // Minutes of CPU per cell, so the committed report is regenerated on demand, not checked in CI.
    const regenerate = process.env.UPDATE_WAVE_BALANCE_REPORT ? it : it.skip;
    regenerate(
        'regenerates wave-defence-balance-report.md',
        () => {
            const cells: SweepCell[] = SWEEP.map(({ label, tuning }) => ({
                label,
                tuning,
                runs: SWEEP_SEEDS.map((seed) =>
                    runWaveDefence({ seed, tuning, maxSimSeconds: SWEEP_SIM_SECONDS, hz: HZ }),
                ),
            }));
            fs.writeFileSync(REPORT_PATH, sweepToMarkdown(cells, SWEEP_SIM_SECONDS, HZ));
        },
        6 * 60 * 60 * 1000,
    );
});
