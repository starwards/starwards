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
 * Recorded at `intervalSimSeconds` equal to the tick length (`1 / hz`) so the recording is
 * tick-exact -- otherwise time-sensitive metrics (`armorStrippedAt`, `secondsFiring`) would differ
 * from the fixture by up to one recording interval for reasons that have nothing to do with
 * `extract.ts` correctness. The acceptance corpus uses a coarser 1 s interval; that tradeoff
 * (precision vs. store size) is orthogonal to this parity check.
 *
 * 60 sim-seconds, not the full 300 s corpus run (see `__fixtures__/gen-parity.ts`, which
 * (re)captured `t0-seed1-parity.json`): long enough to see the armor fully stripped, short enough
 * that ingesting a tick-exact recording (~600 frames) stays fast in CI.
 */
describe('extract.ts parity with the deleted inline metrics', () => {
    jest.setTimeout(60_000);

    it('reproduces TrainingResult scalars for T0 seed 1', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-analysis-parity-'));
        try {
            const metrics = await runTraining(trainingScenarios.T0, {
                seed: 1,
                timeoutSeconds: 60,
                recording: { dir, intervalSimSeconds: 0.1 },
            });

            expect(metrics.killed).toBe(parityFixture.killed);
            expect(metrics.seconds).toBeCloseTo(parityFixture.seconds, 1);
            expect(metrics.armorStrippedAt).not.toBeNull();
            expect(metrics.armorStrippedAt as number).toBeCloseTo(parityFixture.armorStrippedAt, 1);
            expect(metrics.targetHealth).toBeCloseTo(parityFixture.targetHealth, 5);
            expect(metrics.shellsFired).toBe(parityFixture.shellsFired);
            // Within one tick (0.1 s): `secondsFiring` sums fire-window edges recorded at tick
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
