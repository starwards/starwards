import { runTraining, trainingScenarios } from './training-scenarios';

import { waveRung } from './wave-rung';

describe('wave rung', () => {
    it('W-waves is a training rung', () => {
        expect(trainingScenarios['W-waves']).toBeDefined();
    });

    // Uncrewed GVTS, a 30 s interval: waves spawn at 0, 30, 60 and 90 s, 140 km out, so none arrives.
    const fast = waveRung({ name: 'W-test', waveIntervalSeconds: 30, passWaves: 10 });

    it('counts a wave survived once the next one spawns with every station alive', async () => {
        const result = await runTraining(fast, { seed: 1, timeoutSeconds: 100, hz: 10 });
        expect(result.waves).toMatchObject({
            passWaves: 10,
            survived: 3,
            reached: 4,
            stationsLost: 0,
            firstStationLostAt: null,
            raidersKilled: 0,
        });
        expect(result.waves?.raidersSpawned).toBeGreaterThan(2);
        expect(result.killed).toBe(false);
        expect(result.kills).toBe(0);
        expect(result.enemies).toBe(result.waves?.raidersSpawned);
    }, 60_000);

    it('passes and ends the run once it survives its pass waves', async () => {
        const two = waveRung({ name: 'W-test', waveIntervalSeconds: 30, passWaves: 2 });
        const result = await runTraining(two, { seed: 1, timeoutSeconds: 300, hz: 10 });
        expect(result.killed).toBe(true);
        expect(result.waves).toMatchObject({ survived: 2, reached: 3 });
        expect(result.seconds).toBeCloseTo(60, 0);
    }, 60_000);
});
