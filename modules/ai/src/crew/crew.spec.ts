import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { runTraining, trainingScenarios } from '@starwards/server/src/test/training/training-scenarios';

import { CALLOUT_QUESTION } from '../brain/callout';
import { Policy } from '../brain/brain';
import { TRAINING_PLAYER_ID } from '@starwards/server/src/scenarios/training';
import { brainSpecSchema } from '../brain/spec';
import { headlessCrew } from './crew';
import { idlePolicy } from '../brain/policies';
import { readDecisionLog } from '../training/decision-log';
import { rmDirRetrying } from '@starwards/server/src/test/training/analysis/__fixtures__/rm-retry';

const brain = (station: string, callouts?: object) =>
    brainSpecSchema.parse({
        id: station,
        version: 1,
        station,
        model: 'none',
        decisionSeconds: 1,
        role: station,
        mission: 'test',
        callouts,
    });

describe('a headless crew that talks', () => {
    jest.setTimeout(60_000);

    it("delivers one seat's callout into another seat's next request, suppresses its repeats, and records it", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-talk-'));
        try {
            const talker: Policy = {
                name: 'talker',
                answer: async (request, controls, display) => {
                    const rested = await idlePolicy.answer(request, controls, display);
                    return {
                        answers: { ...rested.answers, [CALLOUT_QUESTION]: { choice: 'locked', source: 'rule' } },
                    };
                },
            };
            const heardByHelms: unknown[] = [];
            const listener: Policy = {
                name: 'listener',
                answer: (request, controls, display) => {
                    heardByHelms.push(request.state.heard);
                    return idlePolicy.answer(request, controls, display);
                },
            };
            const crew = headlessCrew({
                shipId: TRAINING_PLAYER_ID,
                latencySeconds: 0,
                seats: [
                    {
                        station: 'weapons',
                        spec: brain('weapons', { locked: { say: 'target locked', when: 'always' } }),
                        policy: talker,
                    },
                    { station: 'helms', spec: brain('helms'), policy: listener },
                ],
            });
            const result = await runTraining(trainingScenarios.T0, {
                seed: 1,
                timeoutSeconds: 2.5,
                crewedPlayer: true,
                beforeTick: crew.beforeTick,
                recording: { dir, intervalSimSeconds: 1 },
            });

            // weapons decides first at t=0, so helms hears it at its own t=0 decision
            expect(heardByHelms[0]).toEqual(['Weapons said "target locked" 0 s ago']);
            expect(heardByHelms[2]).toEqual(['Weapons said "target locked" 2 s ago']);
            expect(crew.stats).toMatchObject({ callouts: 1, suppressed: 2 });
            const sidecar = fs.readFileSync(result.recording!.replace(/\.sgr$/, '.events.jsonl'), 'utf8');
            const callouts = sidecar
                .split('\n')
                .filter((l) => l.includes('"kind":"callout"'))
                .map((l) => (JSON.parse(l) as { data: unknown }).data);
            expect(callouts).toEqual([
                { station: 'weapons', phrase: 'target locked', delivered: true },
                { station: 'weapons', phrase: 'target locked', delivered: false },
                { station: 'weapons', phrase: 'target locked', delivered: false },
            ]);
            const { decisions, requests } = readDecisionLog(result.recording!);
            expect(decisions.filter((d) => d.control === CALLOUT_QUESTION)).toHaveLength(3);
            expect(requests.find((r) => r.station === 'helms')?.heard).toHaveLength(1);
        } finally {
            await rmDirRetrying(dir);
        }
    });
});
