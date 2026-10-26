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
        const modelsOfMapWave = (wave: number) => generateWaveSpecs(wave, mulberry32(1)).map((spec) => spec.model);

        it('starts at map wave 4 and passes after 2 waves survived', () => {
            expect(trainingScenarios['W-waves-late'].description).toContain('passes after 2 waves');
        });

        it('spawns a predator in its first wave, a cataphract and a predator in its second', () => {
            expect(modelsOfMapWave(4)).toContain('predator');
            expect(modelsOfMapWave(5)).toEqual(expect.arrayContaining(['cataphract', 'predator']));
        });

        it('counts waves from its start', async () => {
            const late = waveRung({
                name: 'W-late-probe',
                waveIntervalSeconds: 30,
                passWaves: 2,
                firstWave: 4,
            });
            const result = await runTraining(late, { seed: 1, timeoutSeconds: 300, hz: 10 });
            expect(result.waves).toMatchObject({ survived: 2, reached: 6, stationsLost: 0 });
            expect(result.seconds).toBeCloseTo(60, 0);
        }, 60_000);
    });
});
