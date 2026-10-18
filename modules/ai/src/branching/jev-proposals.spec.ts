import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { CALLOUT_QUESTION, loadBrainSpec, referenceSeatPlan } from '@starwards/bots';
import { ProposalPoint, proposeAlternatives, rankProposals } from './jev-proposals';
import { runTraining, trainingScenarios } from '@starwards/server/src/test/training/training-scenarios';

import { JevAnswerCache } from '../brain/jev-cache';
import { TRAINING_PLAYER_ID } from '@starwards/server/src/scenarios/training';
import { headlessCrew } from '../crew/crew';
import { readRunLog } from './run-log';
import { rmDirRetrying } from '@starwards/server/src/test/training/analysis/__fixtures__/rm-retry';
import { tacticalLevel } from './levels';

const spec = loadBrainSpec(path.join(__dirname, '../../brains/captain-orders.v1.json'));
const answer = {
    model: 'jev-1.13.0',
    inputTokens: 1200,
    answers: {
        [CALLOUT_QUESTION]: {
            type: 'choice' as const,
            choice: 'close_to',
            confidence: 0.4,
            probabilities: { close_to: 0.4, engage: 0.3, hold_here: 0.2, undock: 0.06, silence: 0.04 },
        },
    },
};
const memoryCache = (hit: boolean): JevAnswerCache => ({ get: () => (hit ? answer : undefined), put: () => undefined });

describe('jev proposals at branch points', () => {
    jest.setTimeout(120_000);
    let dir: string;
    let points: ProposalPoint[];

    beforeAll(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-proposals-'));
        const crew = headlessCrew({
            shipId: TRAINING_PLAYER_ID,
            latencySeconds: 0,
            seats: [referenceSeatPlan('captain')],
        });
        const result = await runTraining(trainingScenarios.T0, {
            seed: 1,
            timeoutSeconds: 20,
            crewedPlayer: true,
            beforeTick: crew.beforeTick,
            recording: { dir, intervalSimSeconds: 1 },
        });
        const log = readRunLog(result.recording!);
        const level = tacticalLevel();
        points = level.points(log).map((point) => ({
            run: 'test',
            scenario: 'T0',
            seed: 1,
            recording: result.recording!,
            point,
            level,
            log,
        }));
    });
    afterAll(() => rmDirRetrying(dir));

    it('ranks Jev callouts into playable alternatives, without the call made there or silence', () => {
        const { point, level, log } = points[0];
        const proposals = rankProposals(answer.answers.callout.probabilities, point, level, log, 3);
        expect(proposals.map((p) => p.callout)).not.toContain(point.taken);
        expect(proposals.map((p) => p.callout)).not.toContain('silence');
        expect(proposals.map((p) => p.callout)).not.toContain('undock');
        expect(proposals.map((p) => p.rank)).toEqual(proposals.map((_, i) => i + 1));
    });

    it('answers from the cache at no cost and without reserving', async () => {
        const ledger = path.join(dir, 'spend-cached.jsonl');
        const result = await proposeAlternatives(
            points,
            spec,
            3,
            { ledger, capUsd: 0, job: 't' },
            memoryCache(true),
            () => {
                throw new Error('no client may be made');
            },
        );
        if (result.refused) throw new Error(result.reason);
        expect(result.rows.length).toBeGreaterThan(0);
        expect(result.rows.every((r) => r.cacheHit && r.usd === 0 && r.origin === 'proposal')).toBe(true);
        expect(fs.existsSync(ledger)).toBe(false);
    });

    it('refuses before asking when the uncached requests would pass the cap', async () => {
        const ledger = path.join(dir, 'spend-refused.jsonl');
        let asked = 0;
        const result = await proposeAlternatives(
            points,
            spec,
            3,
            { ledger, capUsd: 1e-9, job: 't' },
            memoryCache(false),
            () => ({
                ask: () => {
                    asked++;
                    return Promise.resolve({ ...answer, latencyMs: 5 });
                },
            }),
        );
        expect(result.refused).toBe(true);
        expect(asked).toBe(0);
        expect(fs.existsSync(ledger)).toBe(false);
    });

    it('reserves, asks once per distinct request, and settles at the tokens paid', async () => {
        const ledger = path.join(dir, 'spend-paid.jsonl');
        let asked = 0;
        const result = await proposeAlternatives(
            points,
            spec,
            3,
            { ledger, capUsd: 1, job: 't' },
            memoryCache(false),
            () => ({
                ask: () => {
                    asked++;
                    return Promise.resolve({ ...answer, latencyMs: 5 });
                },
            }),
        );
        if (result.refused) throw new Error(result.reason);
        expect(asked).toBe(result.rows.length);
        const lines = fs
            .readFileSync(ledger, 'utf8')
            .trim()
            .split('\n')
            .map((l) => JSON.parse(l) as { type: string; tokens?: number });
        expect(lines.map((l) => l.type)).toEqual(['reserve', 'settle']);
        expect(lines[1].tokens).toBe(asked * answer.inputTokens);
    });
});
