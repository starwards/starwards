import * as path from 'node:path';

import { Capabilities, Display } from './controls';
import { brainSpecSchema, loadBrainSpec } from './spec';

import { Policy } from './brain';
import { buttonBrain } from './brain';
import { idlePolicy } from './policies';

const BRAINS = path.resolve(__dirname, '../../brains');

/** A fused brain over two seats: weapons tells helms when it has a lock. */
const tactical = brainSpecSchema.parse({
    id: 'tactical',
    version: 1,
    station: 'tactical',
    model: 'none',
    decisionSeconds: 1,
    role: 'helms and weapons',
    mission: 'kill',
    seats: {
        helms: {},
        weapons: { callouts: { target_locked: { say: 'target locked', when: 'tells helms it has a lock' } } },
    },
    controls: { rotationMode: { hears: ['weapons.target_locked'] } },
});
const display: Display = { panels: { 'targeting-status': { targetId: 't' }, 'helms-stats': {} } };
const capabilities: Capabilities = {
    commands: [
        { command: 'rotationMode', seat: 'helms' },
        { command: 'nextTarget', seat: 'weapons' },
    ],
};

const pressAll: Policy = {
    name: 'press-all',
    answer: async (request, controls, shown) => ({
        answers: {
            ...(await idlePolicy.answer(request, controls, shown)).answers,
            rotationMode: { choice: 'press', source: 'rule' },
            target: { choice: 'next', source: 'rule' },
            'callout:weapons': { choice: 'target_locked', source: 'rule' },
        },
    }),
};

describe('a tactical brain', () => {
    it('decides both seats in one request and tags every press and callout with its seat', async () => {
        const result = await buttonBrain(tactical, pressAll).decide(display, capabilities, []);

        expect(Object.keys(result.request.questions).sort()).toEqual(['callout:weapons', 'rotationMode', 'target']);
        expect(result.decisions.map((d) => [d.control, d.seat])).toEqual([
            ['rotationMode', 'helms'],
            ['target', 'weapons'],
            ['callout:weapons', 'weapons'],
        ]);
        expect(result.callouts).toEqual([{ seat: 'weapons', callout: 'target_locked', phrase: 'target locked' }]);
        expect(result.meta.seats).toEqual(['helms', 'weapons']);
    });

    it("hears its own seats' callouts as the crew's, so a cross-seat dependency is a named callout", async () => {
        const result = await buttonBrain(tactical, idlePolicy).decide(display, capabilities, [
            { speaker: 'weapons', callout: 'target_locked', phrase: 'target locked', secondsAgo: 1 },
        ]);

        expect(result.request.questions.rotationMode.instructions).toMatch(/Weapons said "target locked" 1 s ago/);
    });

    it('is a clone of the helms and weapons brains: every control and callout wording, unchanged', () => {
        const fused = loadBrainSpec(path.join(BRAINS, 'tactical.v1.json'));
        const helms = loadBrainSpec(path.join(BRAINS, 'helms.v19.json'));
        const weapons = loadBrainSpec(path.join(BRAINS, 'weapons.v17.json'));

        expect(fused.station).toBe('tactical');
        expect(fused.controls).toMatchObject({ ...helms.controls, ...weapons.controls });
        expect(fused.seats?.weapons.callouts).toEqual(weapons.callouts);
    });
});
