import { Capabilities, Display } from './controls';
import { JevClient, jevClient } from './jev-client';

import { brainSpecSchema } from './spec';
import { buttonBrain } from './brain';
import { jevPolicy } from './policies';

const spec = brainSpecSchema.parse({
    id: 'helms',
    version: 1,
    station: 'helms',
    model: 'jev-1.13.0',
    decisionSeconds: 0.5,
    minConfidence: 0.5,
    role: 'pilot',
    mission: 'close in',
});
const display: Display = { panels: { 'helms-stats': { maneuveringCommand: { x: 0, y: 0 } } } };
const capabilities: Capabilities = {
    commands: [{ command: 'boost' }, { command: 'strafe' }, { command: 'rotationMode' }],
};

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
    return new Response(JSON.stringify(body), { status, headers });
}

describe('jev client', () => {
    it('refuses to start without a key', () => {
        const saved = process.env.TYPESAFE_API_KEY;
        delete process.env.TYPESAFE_API_KEY;
        try {
            expect(() => jevClient()).toThrow(/TYPESAFE_API_KEY/);
        } finally {
            if (saved !== undefined) process.env.TYPESAFE_API_KEY = saved;
        }
    });

    it('refuses to reach the network when CI is set', () => {
        const saved = process.env.CI;
        process.env.CI = 'true';
        try {
            expect(() => jevClient({ apiKey: 'k' })).toThrow(/CI is set/);
            expect(() => jevClient({ apiKey: 'k', fetchImpl: fetch })).not.toThrow();
        } finally {
            if (saved === undefined) delete process.env.CI;
            else process.env.CI = saved;
        }
    });

    it('posts state, questions and the pinned model, and retries an overloaded answer', async () => {
        const calls: RequestInit[] = [];
        const sleeps: number[] = [];
        const replies = [
            respond(529, { error: 'overloaded' }, { 'retry-after': '2' }),
            respond(200, {
                model: 'jev-1.13.0',
                answers: { boost: { type: 'choice', choice: 'forward', confidence: 0.9, probabilities: {} } },
                usage: { input_tokens: 321 },
            }),
        ];
        const client = jevClient({
            apiKey: 'test-key',
            requestsPerMinute: 60_000,
            sleep: (ms) => {
                sleeps.push(ms);
                return Promise.resolve();
            },
            fetchImpl: (_url, init) => {
                calls.push(init!);
                return Promise.resolve(replies.shift()!);
            },
        });
        const response = await client.ask(
            {
                state: { a: 1 },
                questions: { boost: { type: 'choice', instructions: 'go?', criteria: { forward: 'f' } } },
            },
            'jev-1.13.0',
        );
        expect(JSON.parse(calls[0].body as string)).toEqual({
            model: 'jev-1.13.0',
            state: { a: 1 },
            questions: { boost: { type: 'choice', instructions: 'go?', criteria: { forward: 'f' } } },
        });
        expect((calls[0].headers as Record<string, string>).authorization).toBe('Bearer test-key');
        expect(sleeps).toContain(2000);
        expect(response).toMatchObject({
            model: 'jev-1.13.0',
            inputTokens: 321,
            answers: { boost: { choice: 'forward' } },
        });
    });

    it('gives up on a client error', async () => {
        const client = jevClient({
            apiKey: 'k',
            requestsPerMinute: 60_000,
            fetchImpl: () => Promise.resolve(respond(422, { detail: 'bad field' })),
        });
        await expect(client.ask({ state: {}, questions: {} }, 'm')).rejects.toThrow(/422/);
    });
});

describe('jev policy', () => {
    it('acts on confident answers and rests controls whose answer is missing, unknown or unsure', async () => {
        const client: JevClient = {
            ask: () =>
                Promise.resolve({
                    model: 'jev-1.13.0',
                    inputTokens: 100,
                    latencyMs: 80,
                    answers: {
                        boost: { type: 'choice', choice: 'forward', confidence: 0.8, probabilities: { forward: 0.85 } },
                        strafe: { type: 'choice', choice: 'right', confidence: 0.2, probabilities: { right: 0.4 } },
                        rotationMode: { type: 'choice', choice: 'launch', confidence: 1, probabilities: {} },
                    },
                }),
        };
        const result = await buttonBrain(spec, jevPolicy(spec, client)).decide(display, capabilities);
        const byControl = Object.fromEntries(result.decisions.map((d) => [d.control, d]));
        expect(byControl.boost).toMatchObject({ choice: 'forward', source: 'model', confidence: 0.8 });
        expect(byControl.strafe).toMatchObject({ choice: 'hold', source: 'fallback', confidence: 0.2 });
        expect(byControl.rotationMode).toMatchObject({ choice: 'wait', source: 'fallback' });
        expect(result.presses).toEqual([{ command: 'boost', args: {}, value: 0.05 }]);
        expect(result.meta).toMatchObject({
            brain: 'helms',
            version: 1,
            policy: 'jev',
            model: 'jev-1.13.0',
            inputTokens: 100,
        });
    });
});
