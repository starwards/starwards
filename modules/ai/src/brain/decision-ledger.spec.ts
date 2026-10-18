import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { CALLOUT_QUESTION, loadBrainSpec } from '@starwards/bots';
import { DecisionRow, coverage, coveragePriority, decisionRow, joinPayouts, readRows } from './decision-ledger';
import { JevAnswerCache, meteredJevClient } from './jev-cache';
import { runTraining, trainingScenarios } from '@starwards/server/src/test/training/training-scenarios';

import { TRAINING_PLAYER_ID } from '@starwards/server/src/scenarios/training';
import { headlessCrew } from '../crew/crew';
import { jevPolicy } from './policies';
import { rmDirRetrying } from '@starwards/server/src/test/training/analysis/__fixtures__/rm-retry';

const input = {
    run: 'r/captain-reference/T3-directed_seed7',
    scenario: 'T3-directed',
    seed: 7,
    seat: 'captain',
    t: 12,
    control: CALLOUT_QUESTION,
    origin: 'proposal' as const,
    recording: 'x.sgr',
    brain: 'captain-orders',
    version: 1,
    model: 'jev-1.13.0',
    cacheKey: 'k',
    inputTokens: 1000,
    choice: 'engage',
    confidence: 0.5,
    probabilities: { engage: 0.5, close_to: 0.3, hold_here: 0.2 },
};

const branch = (alternative: string, value: number | null, extra: object = {}) => ({
    scenario: 'T3-directed',
    seed: 7,
    level: 'tactical',
    t: 12,
    alternative,
    prefixMatches: true,
    delta: { value },
    ...extra,
});

describe('decision ledger', () => {
    it('charges a cache hit nothing and a miss its input tokens', () => {
        expect(decisionRow({ ...input, cacheHit: true }).usd).toBe(0);
        expect(decisionRow({ ...input, cacheHit: false }).usd).toBeGreaterThan(0);
        expect(decisionRow({ ...input, cacheHit: true }).payout).toEqual({ status: 'not_measured' });
    });

    it('fills the payout of a branched decision from the corpus, and leaves the rest unmeasured', () => {
        const rows: DecisionRow[] = [
            decisionRow({ ...input, cacheHit: true }),
            decisionRow({ ...input, t: 40, cacheHit: true }),
        ];
        const joined = joinPayouts(rows, [
            branch('close_to', 0.2),
            branch('hold_here', -0.1),
            branch('close_to', 0.4, { seed: 8 }),
            branch('engage@b', 1, { prefixMatches: false }),
        ]);
        expect(joined[0].payout).toEqual({
            status: 'branched',
            delta: expect.closeTo(0.05, 9) as number,
            alternatives: { close_to: { delta: 0.2, branches: 1 }, hold_here: { delta: -0.1, branches: 1 } },
            branches: ['T3-directed/7/tactical/12.000/close_to', 'T3-directed/7/tactical/12.000/hold_here'],
            seeds: [7],
        });
        expect(joined[1].payout).toEqual({ status: 'not_measured' });
        expect(coverage(joined)).toEqual({ 'T3-directed': { measured: 1, total: 2 } });
    });

    it('puts unmeasured low-confidence decisions first', () => {
        const rank = coveragePriority([]);
        const low = decisionRow({ ...input, cacheHit: true });
        const high = decisionRow({ ...input, probabilities: { engage: 0.9 }, cacheHit: true });
        const measured = joinPayouts([low], [branch('close_to', 0)])[0];
        expect(rank(low)).toBeLessThan(rank(high));
        expect(rank(high)).toBeLessThan(rank(measured));
    });
});

describe('a Jev seat writing the decision ledger', () => {
    jest.setTimeout(60_000);

    it('writes one row per decision of a run answered from the cache, at no cost', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-ledger-'));
        try {
            const spec = loadBrainSpec(path.join(__dirname, '../../brains/captain.v1.json'));
            // every request is in the cache: the client behind it must never be asked
            const cache: JevAnswerCache = {
                get: () => ({
                    model: 'jev-1.13.0',
                    inputTokens: 900,
                    answers: {
                        [CALLOUT_QUESTION]: {
                            type: 'choice',
                            choice: 'hold_here',
                            confidence: 0.55,
                            probabilities: { hold_here: 0.55, close_to: 0.45 },
                        },
                    },
                }),
                put: () => undefined,
            };
            const client = meteredJevClient({ ask: () => Promise.reject(new Error('paid request')) }, cache);
            const file = path.join(dir, 'jev-decisions.jsonl');
            const crew = headlessCrew({
                shipId: TRAINING_PLAYER_ID,
                latencySeconds: 0,
                seats: [{ station: 'captain', spec, policy: jevPolicy(spec, client) }],
                decisionLedger: { file, run: 'test/run', scenario: 'T0', seed: 1, recording: 'r.sgr' },
            });
            await runTraining(trainingScenarios.T0, {
                seed: 1,
                timeoutSeconds: 11,
                crewedPlayer: true,
                beforeTick: crew.beforeTick,
            });
            const rows = readRows(file);
            expect(rows.length).toBe(client.usage.requests);
            expect(rows.length).toBeGreaterThanOrEqual(2);
            expect(rows[0]).toMatchObject({
                run: 'test/run',
                seat: 'captain',
                control: CALLOUT_QUESTION,
                origin: 'play',
                brain: 'captain',
                version: 1,
                cacheHit: true,
                inputTokens: 0,
                usd: 0,
                choice: 'hold_here',
                confidence: 0.55,
                payout: { status: 'not_measured' },
            });
            expect(rows[0].cacheKey).toMatch(/^[0-9a-f]{64}$/);
            expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
        } finally {
            await rmDirRetrying(dir);
        }
    });
});
