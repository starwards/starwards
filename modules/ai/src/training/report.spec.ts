import { CrewRunResult } from './train-crew';
import { DockOutcome } from '@starwards/server/src/test/training/dock-rung';
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

describe('crewReport on a dock rung', () => {
    const dockRun = (crew: string, seed: number, dock: Partial<DockOutcome>): CrewRunResult => ({
        ...waveRun(crew, seed, {}),
        waves: undefined,
        dock: {
            platesAtStart: 16,
            platesHealthyAtStart: 0,
            platesRepaired: 0,
            passedAt: null,
            dockedSeconds: 0,
            launches: 0,
            launchesPerMinute: 0,
            overhaulPreemptedRenewal: false,
            ...dock,
        },
    });
    const report = crewReport(
        'D-dock-0of16',
        [
            dockRun('a', 1, { passedAt: 300, platesRepaired: 16, dockedSeconds: 280, launchesPerMinute: 0.2 }),
            dockRun('a', 2, { platesRepaired: 4, dockedSeconds: 100, overhaulPreemptedRenewal: true }),
        ],
        'header',
    );

    it('tabulates passes, docked seconds, plates repaired, launch rate and preemptions per crew', () => {
        expect(report).toContain(
            '| crew | passed | seconds docked (mean) | plates repaired (mean) | launches per minute (mean) |',
        );
        expect(report).toContain('| a | 1/2 | 190.0 | 10.0 | 0.10 | 1/2 |');
    });

    it('labels the main table by pass, not kill, on a dock rung', () => {
        expect(report).toContain('| crew | brains | passed | time to pass p10 / median / p90 (s) |');
    });

    it('reads a failed late run with the attacker killed as not passed', () => {
        const failed = { ...dockRun('c', 1, {}), killed: false, kills: 1, enemies: 1 } as CrewRunResult;
        const late = crewReport('D-dock-0of16-late', [failed], 'header');
        expect(late).toMatch(/\| c \|[^\n]*\| 0\/1 \|/);
        expect(late).not.toContain('(enemies');
    });
});
