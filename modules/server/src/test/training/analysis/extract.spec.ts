import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { runTraining, trainingScenarios } from '../training-scenarios';

import parityFixture from './__fixtures__/t0-seed1-parity.json';
import { rmDirRetrying } from './__fixtures__/rm-retry';

/** Within 0.5% of the fixture -- large-magnitude distance metrics (metres) accumulate float
 * rounding differently frame-by-frame vs. tick-by-tick, so a fixed decimal-place tolerance either
 * over- or under-constrains them depending on magnitude. */
function expectCloseRelative(actual: number, expected: number, relTolerance = 0.005): void {
    const tolerance = Math.max(Math.abs(expected) * relTolerance, 1e-6);
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

/**
 * Parity fixture: `runTraining`'s scalars (now computed by `extract.ts` reading a store, not the
 * deleted inline loop) must reproduce the values that inline loop produced for the same seed.
 * `t0-seed1-parity.json` is that inline loop's output on the current physics, written by
 * `__fixtures__/recapture-t0-seed1-parity.ts` -- a physics change that moves these numbers is
 * recaptured with that script, never from `extract.ts` itself.
 * Recorded every `FRAME_SECONDS`, not every 60 Hz tick: ingesting ~3,600 tick-exact frames takes
 * minutes. Frame-based `armorStrippedAt` may therefore land up to one frame after the inline
 * value; fire time comes from tick-resolution events and stays exact. 60 sim-seconds: long enough
 * to see the armor fully stripped.
 */
const FRAME_SECONDS = 0.1;
describe('extract.ts parity with the deleted inline metrics', () => {
    jest.setTimeout(120_000);

    it('reproduces TrainingResult scalars for T0 seed 1', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-analysis-parity-'));
        try {
            const metrics = await runTraining(trainingScenarios.T0, {
                seed: 1,
                timeoutSeconds: 60,
                recording: { dir, intervalSimSeconds: FRAME_SECONDS },
            });

            expect(metrics.killed).toBe(parityFixture.killed);
            expect(metrics.seconds).toBeCloseTo(parityFixture.seconds, 1);
            expect(metrics.armorStrippedAt).not.toBeNull();
            // frame-based: the recording sees the strip at the first frame after the inline tick
            expect((metrics.armorStrippedAt as number) - parityFixture.armorStrippedAt).toBeGreaterThanOrEqual(-1e-6);
            expect((metrics.armorStrippedAt as number) - parityFixture.armorStrippedAt).toBeLessThanOrEqual(
                FRAME_SECONDS,
            );
            expect(metrics.targetHealth).toBeCloseTo(parityFixture.targetHealth, 5);
            expect(metrics.shellsFired).toBe(parityFixture.shellsFired);
            // Within one tick: `secondsFiring` sums fire-window edges recorded at tick
            // boundaries, so it can differ from the inline loop's continuous accumulation by up
            // to one tick's worth of rounding.
            expectCloseRelative(metrics.secondsFiring, parityFixture.secondsFiring);
            expectCloseRelative(metrics.meanDistance, parityFixture.meanDistance);
            expectCloseRelative(metrics.targetDrift, parityFixture.targetDrift);
            expectCloseRelative(metrics.gvtsSpeed, parityFixture.gvtsSpeed);
        } finally {
            await rmDirRetrying(dir);
        }
    });
});
