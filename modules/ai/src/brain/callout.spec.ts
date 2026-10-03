import { CALLOUT_QUESTION, SILENCE, calloutSaid } from './callout';
import { Capabilities, Display } from './controls';

import { JevClient } from './jev-client';
import { brainSpecSchema } from './spec';
import { buildRequest } from './request';
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
        expect(result.callouts).toEqual([{ callout: 'target_locked', phrase: 'target locked' }]);
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
        expect(unsure.callouts).toEqual([]);
        expect(unsure.decisions.find((d) => d.control === CALLOUT_QUESTION)).toMatchObject({
            choice: SILENCE,
            source: 'fallback',
        });

        const idle = await buttonBrain(spec, idlePolicy).decide(display, capabilities, []);
        expect(idle.callouts).toEqual([]);
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

    it('fill a template from the speaker display, and say nothing when the display does not show the value', () => {
        const talker = brainSpecSchema.parse({
            ...spec,
            callouts: {
                need_turn: { say: 'need you {degrees}° {side}', when: 'off the gun line', fill: 'lockedOffNose' },
                gun_skewed: { say: 'gun skewed {degrees}° {side}', when: 'gun bent', fill: 'gunSkew' },
            },
        });
        const radar = (bearing: number) => ({ ownShip: { id: 'me', heading: 90 }, contacts: [{ id: 't', bearing }] });
        const weapons = (bearing: number) => ({
            panels: { 'targeting-status': { targetId: 't' } },
            radar: radar(bearing),
        });

        expect(calloutSaid(talker, 'need_turn', weapons(84))).toEqual({
            callout: 'need_turn',
            phrase: 'need you 6° left',
        });
        expect(calloutSaid(talker, 'need_turn', weapons(93.4))?.phrase).toBe('need you 3° right');
        expect(calloutSaid(talker, 'need_turn', weapons(90.2))).toBeUndefined();
        expect(
            calloutSaid(talker, 'need_turn', { panels: { 'targeting-status': { targetId: null } } }),
        ).toBeUndefined();

        const report = (value: number) => ({
            panels: { 'damage-report': [{ system: '/chainGuns/0', field: 'bearingSkew', value, normal: 0 }] },
        });
        expect(calloutSaid(talker, 'gun_skewed', report(-7.6))?.phrase).toBe('gun skewed 8° left');
        expect(calloutSaid(talker, 'gun_skewed', { panels: { 'damage-report': [] } })).toBeUndefined();
        expect(calloutSaid(talker, SILENCE, report(5))).toBeUndefined();
    });

    it('name the nearest ship-like contact beyond the helms radar, read off the signals display', () => {
        const signals = brainSpecSchema.parse({
            ...spec,
            callouts: {
                far_contact: { say: 'contact {name} at {range} km, {bearing}', when: 'far', fill: 'farContact' },
            },
        });
        const radarDisplay = (contacts: object[]) => ({
            panels: {},
            radar: { ownShip: { id: 'me', heading: 90 }, contacts },
        });
        const near = { id: 'n', name: 'near', distance: 3000, bearing: 90, type: 'Spaceship' };
        const rock = { id: 'r', name: 'rock', distance: 6000, bearing: 90, type: 'Asteroid' };
        const blip = { id: 'u', name: 'UFO-u', distance: 7400, bearing: 70 };

        expect(calloutSaid(signals, 'far_contact', radarDisplay([near, rock, blip]))?.phrase).toBe(
            'contact UFO-u at 7.4 km, 20° left of the nose',
        );
        expect(calloutSaid(signals, 'far_contact', radarDisplay([near, rock]))).toBeUndefined();
    });

    it('read out to each decision only the callouts it listens for, and keep them out of the shared state', () => {
        const listener = brainSpecSchema.parse({
            ...spec,
            callouts: undefined,
            controls: { target: { hears: ['helms.need_lock'] } },
        });
        const controls = [
            {
                id: 'target',
                command: 'target',
                options: { next: 'n', none: 'x' },
                rest: 'none',
                press: () => undefined,
            },
            { id: 'fire', command: 'fireChainGun', options: { fire: 'f' }, rest: 'fire', press: () => undefined },
        ] as unknown as Parameters<typeof buildRequest>[2];
        const request = buildRequest(listener, display, controls, undefined, [
            { speaker: 'helms', callout: 'need_lock', phrase: 'need a lock', secondsAgo: 1 },
            { speaker: 'engineer', callout: 'energy_low', phrase: 'energy low', secondsAgo: 1 },
            { speaker: 'helms', phrase: 'need a lock', secondsAgo: 1 },
        ]);

        expect(request.questions.target.instructions).toMatch(/On the radio: Helms said "need a lock" 1 s ago.$/);
        expect(request.questions.fire.instructions).not.toMatch(/radio/);
        expect(request.state).not.toHaveProperty('heard');
    });
});
