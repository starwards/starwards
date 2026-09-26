import { runTraining, trainingScenarios } from './training-scenarios';

describe('runTraining', () => {
    jest.setTimeout(30_000);

    it('without a `recording` option still analyzes via a scratch recording, then cleans it up', async () => {
        const metrics = await runTraining(trainingScenarios.T0, { seed: 1, timeoutSeconds: 5 });

        expect(metrics.recording).toBeUndefined();
        expect(metrics.frames).toBeUndefined();
        expect(Array.isArray(metrics.failedChecks)).toBe(true);
        // T0 seed 1 never kills in 5 s and never strips armor that fast either -- shouldn't crash
        // or report a false failure for checks whose inputs (e.g. an `armor_stripped` event)
        // don't exist yet.
        expect(metrics.killed).toBe(false);
    });
});
