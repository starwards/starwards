import { CrewRunResult } from './train-crew';
import { WaveOutcome } from '@starwards/server/src/test/training/wave-rung';
import { crewReport } from './report';

function waveRun(crew: string, seed: number, waves: Partial<WaveOutcome>): CrewRunResult {
    const outcome: WaveOutcome = {
        passWaves: 3,
        survived: 0,
        reached: 1,
        stationsLost: 0,
        firstStationLostAt: null,
        raidersKilled: 0,
        raidersSpawned: 2,
        gvtsHealth: 1,
        passedAt: null,
        ...waves,
    };
    return {
        crew,
        seed,
        brains: [],
        killed: outcome.passedAt !== null,
        kills: outcome.raidersKilled,
        enemies: outcome.raidersSpawned,
        seconds: outcome.passedAt ?? 1500,
        shellsFired: 0,
        targetHealth: 1,
        failedChecks: [],
        passedChecks: [],
        decisions: 0,
        fallbacks: 0,
        refused: 0,
        callouts: 0,
        suppressed: 0,
        inputTokens: 0,
        cachedTokens: 0,
        cacheHits: 0,
        jevRequests: 0,
        controls: {},
        score: null,
        waves: outcome,
    } as unknown as CrewRunResult;
}

describe('crewReport on a wave rung', () => {
    const results = [
        waveRun('a', 1, { survived: 3, reached: 4, raidersKilled: 9, raidersSpawned: 10, passedAt: 1200 }),
        waveRun('a', 2, { survived: 1, reached: 3, stationsLost: 1, firstStationLostAt: 700, gvtsHealth: 0 }),
        waveRun('b', 1, { survived: 0, reached: 2, stationsLost: 3, raidersKilled: 1 }),
        waveRun('b', 2, { survived: 2, reached: 3, gvtsHealth: 0.5 }),
    ];
    const report = crewReport('W-waves', results, 'header');

    it('tabulates passes, waves survived, stations lost, raiders killed and GVTS survival per crew', () => {
        expect(report).toContain(
            '| crew | passed | waves survived min / median / max | stations lost (mean) | raiders killed / spawned | GVTS alive | GVTS health (mean) |',
        );
        expect(report).toContain('| a | 1/2 | 1 / 2.0 / 3 | 0.50 | 9/12 | 1/2 | 0.50 |');
        expect(report).toContain('| b | 0/2 | 0 / 1.0 / 2 | 1.50 | 1/4 | 2/2 | 0.75 |');
    });

    it('pairs waves survived seed by seed', () => {
        expect(report).toMatch(/\| b \| waves survived \(higher is better\) \| 2 \| 2\.0 \| 1\.0 \|/);
    });
});
