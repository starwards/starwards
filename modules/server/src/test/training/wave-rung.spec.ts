import { runTraining, trainingScenarios } from './training-scenarios';

import { generateWaveSpecs } from '../../scenarios/wave-defence';
import { mulberry32 } from '@starwards/core/internal';
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

    describe('W-waves-late', () => {
        const late = trainingScenarios['W-waves-late'];

        it('starts at map wave 4, passing after 2 waves survived', () => {
            expect(late).toBeDefined();
            expect(trainingScenarios['W-waves']).toBeDefined();
            expect(late.description).toContain('passes after 2 waves');
        });

        it('spawns predators and a cataphract in its first two waves', () => {
            const modelsOfMapWave = (wave: number) => generateWaveSpecs(wave, mulberry32(1)).map((spec) => spec.model);
            const spawned = [modelsOfMapWave(4), modelsOfMapWave(5)];
            expect(spawned[0]).toContain('predator');
            expect(spawned[1]).toEqual(expect.arrayContaining(['cataphract', 'predator']));
        });

        it('counts rung waves, not map waves', async () => {
            const result = await runTraining(
                waveRung({ name: 'W-late-probe', waveIntervalSeconds: 30, passWaves: 2, skipWaves: 3 }),
                { seed: 1, timeoutSeconds: 300, hz: 10 },
            );
            expect(result.waves).toMatchObject({ survived: 2, reached: 3, stationsLost: 0 });
            expect(result.seconds).toBeCloseTo(60, 0);
        }, 60_000);
    });
});
