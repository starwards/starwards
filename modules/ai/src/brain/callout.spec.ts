import { CALLOUT_QUESTION, SILENCE } from './callout';
import { Capabilities, Display } from './controls';

import { JevClient } from './jev-client';
import { brainSpecSchema } from './spec';
import { buttonBrain } from './brain';
import { idlePolicy } from './policies';
import { jevPolicy } from './policies';

const spec = brainSpecSchema.parse({
    id: 'weapons',
    version: 1,
    station: 'weapons',
    model: 'jev-1.13.0',
    decisionSeconds: 1,
    role: 'gunner',
    mission: 'kill',
    callouts: {
        target_locked: { say: 'target locked', when: 'tells helms it can match the target. Choose this when locked.' },
    },
});
const display: Display = { panels: { 'targeting-status': { targetId: 't' } } };
const capabilities: Capabilities = { commands: [{ command: 'target' }] };

function client(answers: Record<string, { choice: string; confidence: number }>): JevClient & { asked: unknown[] } {
    const asked: unknown[] = [];
    return {
        asked,
        ask: (request) => {
            asked.push(request);
            return Promise.resolve({
                model: 'jev-1.13.0',
                inputTokens: 1,
                latencyMs: 1,
                answers: Object.fromEntries(
                    Object.entries(answers).map(([k, a]) => [k, { type: 'choice', probabilities: {}, ...a }]),
                ),
            });
        },
    };
}

describe('callouts', () => {
    it('ask one callout question over the phrases and silence, and read out what was heard', async () => {
        const jev = client({ [CALLOUT_QUESTION]: { choice: 'target_locked', confidence: 0.9 } });
        const result = await buttonBrain(spec, jevPolicy(spec, jev)).decide(display, capabilities, [
            { speaker: 'helms', phrase: 'on its tail', secondsAgo: 2.2 },
        ]);

        const question = result.request.questions[CALLOUT_QUESTION];
        expect(Object.keys(question.criteria)).toEqual(['target_locked', SILENCE]);
        expect(question.criteria.target_locked).toMatch(/^say "target locked": tells helms/);
        expect(result.request.state.heard).toEqual(['Helms said "on its tail" 2 s ago']);
        expect(result.callout).toBe('target locked');
        expect(result.decisions.find((d) => d.control === CALLOUT_QUESTION)).toMatchObject({
            choice: 'target_locked',
            source: 'model',
        });
        expect(result.presses).toEqual([]);
    });

    it('keep silent on an unknown answer, and say nothing under a policy that does not talk', async () => {
        const unsure = await buttonBrain(
            spec,
            jevPolicy(spec, client({ [CALLOUT_QUESTION]: { choice: 'sing', confidence: 1 } })),
        ).decide(display, capabilities, []);
        expect(unsure.callout).toBeUndefined();
        expect(unsure.decisions.find((d) => d.control === CALLOUT_QUESTION)).toMatchObject({
            choice: SILENCE,
            source: 'fallback',
        });

        const idle = await buttonBrain(spec, idlePolicy).decide(display, capabilities, []);
        expect(idle.callout).toBeUndefined();
    });

    it('a brain without callouts asks no callout question, and a seat on no channel has no `heard`', async () => {
        const silent = brainSpecSchema.parse({ ...spec, callouts: undefined });
        const result = await buttonBrain(silent, idlePolicy).decide(display, capabilities);
        expect(result.request.questions).not.toHaveProperty(CALLOUT_QUESTION);
        expect(result.request.state).not.toHaveProperty('heard');
    });

    it('`silence` cannot be a phrase option', () => {
        expect(() =>
            brainSpecSchema.parse({ ...spec, callouts: { silence: { say: 'shh', when: 'never' } } }),
        ).toThrow();
    });
});
