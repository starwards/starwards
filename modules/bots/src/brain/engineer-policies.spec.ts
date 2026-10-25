import { Capabilities, Display, stationControls } from './controls';
import { EngineerPolicyName, makeEngineerPolicy } from './engineer-policies';

import { EngineerStyle, engineerChoice } from './reference-engineer';
import { BrainRequest } from './request';
import { makeReferencePolicy } from './reference-policy';
import { setReferenceKnobs } from './reference-knobs';

const capabilities: Capabilities = {
    commands: [
        { command: 'systemPower', systems: ['/reactor', '/chainGuns/0'] },
        { command: 'systemCoolant', systems: ['/reactor', '/chainGuns/0'] },
        { command: 'cycleRepairPriority' },
    ],
};

function display(energy: number, defects: { system: string; field: string }[] = [], priorities = {}): Display {
    const slots = ['feedSystemOverhaul', 'reactorJumpStart', 'actuatorRecalibration'].map((protocolId) => ({
        protocolId,
        priority: (priorities as Record<string, string>)[protocolId] ?? 'OFF',
        refusalReason: '',
    }));
    return {
        panels: {
            'full-systems-status': [
                { pointer: '/reactor', power: 0.5, coolantFactor: 0, heat: 0 },
                { pointer: '/chainGuns/0', power: 0.5, coolantFactor: 0, heat: 0 },
            ],
            'engineering-status': { energy, maxEnergy: 1000, energyCells: 2 },
            'repair-queue': { slots },
            'damage-report': defects.map((d) => ({ ...d, value: 0.5, normal: 1 })),
        },
    };
}

async function choices(name: EngineerPolicyName, shown: Display) {
    const controls = stationControls({ display: shown, capabilities, burstSeconds: 2 });
    const { answers } = await makeEngineerPolicy(name, 2).answer({} as BrainRequest, controls, shown);
    return Object.fromEntries(Object.entries(answers).map(([id, a]) => [id, a.choice]));
}

describe('scripted engineers', () => {
    it('all-max raises every power and touches nothing else', async () => {
        expect(await choices('all-max', display(500))).toEqual({
            'systemPower:/reactor': 'raise',
            'systemPower:/chainGuns/0': 'raise',
            'systemCoolant:/reactor': 'hold',
            'systemCoolant:/chainGuns/0': 'hold',
            'cycleRepairPriority:feedSystemOverhaul': 'none',
            'cycleRepairPriority:reactorJumpStart': 'none',
            'cycleRepairPriority:actuatorRecalibration': 'none',
        });
    });

    it('all-shutdown lowers every power, the reactor too', async () => {
        const c = await choices('all-shutdown', display(500));
        expect(c['systemPower:/reactor']).toBe('lower');
        expect(c['systemPower:/chainGuns/0']).toBe('lower');
    });

    it('random picks among each power control options, and replays', async () => {
        const first = await choices('random', display(500));
        expect(['raise', 'lower', 'hold', 'centre']).toContain(first['systemPower:/reactor']);
        expect(await choices('random', display(500))).toEqual(first);
    });

    it('never-jump-start leaves a dry reactor dry; the reference engineer jump-starts it', async () => {
        expect((await choices('never-jump-start', display(50)))['cycleRepairPriority:reactorJumpStart']).toBe('none');
        expect((await choices('reference-repairing', display(50)))['cycleRepairPriority:reactorJumpStart']).toBe(
            'raise',
        );
    });

    it('reference-repairing queues the field repair that fixes a shown defect, one at a time', async () => {
        const defect = [{ system: '/chainGuns/0', field: 'rateOfFireFactor' }];
        const c = await choices('reference-repairing', display(800, defect));
        expect(c['cycleRepairPriority:feedSystemOverhaul']).toBe('raise');
        expect(c['cycleRepairPriority:actuatorRecalibration']).toBe('none');
        const busy = await choices('reference-repairing', display(800, defect, { actuatorRecalibration: 'RUNNING' }));
        expect(busy['cycleRepairPriority:feedSystemOverhaul']).toBe('none');
        const low = await choices('reference-repairing', display(200, defect));
        expect(low['cycleRepairPriority:feedSystemOverhaul']).toBe('none');
    });
});

describe('a magazine-first repairing engineer', () => {
    it('queues the feed-system overhaul before another idle repair that also fixes a shown defect', async () => {
        const defects = [
            { system: '/chainGuns/0', field: 'bearingSkew' },
            { system: '/magazine', field: 'capacity' },
        ];
        const shown = display(800, defects);
        const slots = (
            shown.panels['repair-queue'] as {
                slots: { protocolId: string; priority?: string; refusalReason?: string }[];
            }
        ).slots;
        slots.unshift({ protocolId: 'actuatorRecalibration', priority: 'OFF', refusalReason: '' });
        const controls = stationControls({ display: shown, capabilities, burstSeconds: 1 });
        const answer = async (repair: 'all' | 'magazine') =>
            (await makeReferencePolicy(1, { jumpStart: true, repair }).answer({} as BrainRequest, controls, shown))
                .answers;
        expect((await answer('all'))['cycleRepairPriority:feedSystemOverhaul']?.choice).toBe('none');
        expect((await answer('magazine'))['cycleRepairPriority:feedSystemOverhaul']?.choice).toBe('raise');
    });
});

describe('a magazine-retrying repairing engineer', () => {
    const defects = [{ system: '/magazine', field: 'capacity' }];
    const cancelled = 'Feed-system overhaul was cancelled: insufficient reactor energy';

    async function answer(repair: 'magazine' | 'magazine-retry', refusalReason: string) {
        const shown = display(800, defects);
        const slots = (shown.panels['repair-queue'] as { slots: { protocolId: string; refusalReason: string }[] })
            .slots;
        slots[0].refusalReason = refusalReason;
        const controls = stationControls({ display: shown, capabilities, burstSeconds: 1 });
        const { answers } = await makeReferencePolicy(1, { jumpStart: true, repair }).answer(
            {} as BrainRequest,
            controls,
            shown,
        );
        return answers['cycleRepairPriority:feedSystemOverhaul']?.choice;
    }

    it('queues the feed-system overhaul again after it was cancelled for lack of reactor energy', async () => {
        expect(await answer('magazine', cancelled)).toBe('none');
        expect(await answer('magazine-retry', cancelled)).toBe('raise');
    });

    it('still leaves a repair that is refused for another reason', async () => {
        expect(await answer('magazine-retry', 'Feed-system overhaul needs a docked ship')).toBe('none');
    });
});

describe('reference engineer', () => {
    const referenceCapabilities: Capabilities = {
        commands: [{ command: 'systemPower', systems: ['/thrusters/0'] }, { command: 'cycleRepairPriority' }],
    };
    const reactorDefect = { system: '/reactor', field: 'effeciencyFactor' };
    const gunDefect = { system: '/chainGuns/0', field: 'rateOfFireFactor' };

    function shown(energy: number, defects: { system: string; field: string }[], thrusterPower = 0.25): Display {
        return {
            panels: {
                'full-systems-status': [{ pointer: '/thrusters/0', power: thrusterPower, coolantFactor: 0, heat: 0 }],
                'engineering-status': { energy, maxEnergy: 1000, energyCells: 2 },
                'repair-queue': {
                    slots: ['feedSystemOverhaul', 'powerTrainReset'].map((protocolId) => ({
                        protocolId,
                        priority: 'OFF',
                        refusalReason: '',
                    })),
                },
                'damage-report': defects.map((d) => ({ ...d, value: 0.5, normal: 1 })),
            },
        };
    }

    async function referenceChoices(seen: Display) {
        const controls = stationControls({ display: seen, capabilities: referenceCapabilities, burstSeconds: 2 });
        const { answers } = await makeReferencePolicy(2).answer({} as BrainRequest, controls, seen);
        return Object.fromEntries(Object.entries(answers).map(([id, a]) => [id, a.choice]));
    }

    it('repairs the reactor and leaves other systems to a repairing engineer', async () => {
        const reactor = await referenceChoices(shown(800, [gunDefect, reactorDefect]));
        expect(reactor['cycleRepairPriority:powerTrainReset']).toBe('raise');
        expect(reactor['cycleRepairPriority:feedSystemOverhaul']).toBe('none');
        expect((await referenceChoices(shown(800, [gunDefect])))['cycleRepairPriority:feedSystemOverhaul']).toBe(
            'none',
        );
    });

    it('shuts the thrusters down on a low store only while the reactor is damaged', async () => {
        expect((await referenceChoices(shown(300, [reactorDefect])))['systemPower:/thrusters/0']).toBe('lower');
        expect((await referenceChoices(shown(300, [])))['systemPower:/thrusters/0']).toBe('hold');
        expect((await referenceChoices(shown(450, [reactorDefect], 0)))['systemPower:/thrusters/0']).toBe('hold');
    });
});

describe('a magazine-first repairing engineer', () => {
    const defects = [
        { system: '/reactor', field: 'effeciencyFactor' },
        { system: '/magazine', field: 'capacity' },
    ];
    const shown = (priorities: Record<string, string>): Display => {
        const d = display(800, defects, priorities);
        const slots = (d.panels['repair-queue'] as { slots: { protocolId: string; priority: string }[] }).slots;
        slots.push({ protocolId: 'powerTrainReset', priority: priorities.powerTrainReset ?? 'OFF' });
        return d;
    };
    const choice = (
        key: string,
        now: number,
        priorities: Record<string, string>,
        repair: EngineerStyle['repair'] = 'magazine-first',
    ) =>
        engineerChoice(
            'cycleRepairPriority',
            key,
            shown(priorities) as Parameters<typeof engineerChoice>[2],
            { jumpStart: true, repair },
            false,
            now,
        );

    afterEach(() => setReferenceKnobs());

    it('cancels a running reactor repair for the feed-system overhaul once wave 1 is over', () => {
        expect(choice('powerTrainReset', 310, { powerTrainReset: 'RUNNING' })).toBe('lower');
        expect(choice('powerTrainReset', 310, { powerTrainReset: 'RUNNING' }, 'magazine-retry')).toBe('none');
        expect(choice('feedSystemOverhaul', 310, { powerTrainReset: 'RUNNING' })).toBe('none');
        expect(choice('feedSystemOverhaul', 310, {})).toBe('raise');
    });

    it('leaves the reactor repair running during wave 1 and after the window', () => {
        expect(choice('powerTrainReset', 200, { powerTrainReset: 'RUNNING' })).toBe('none');
        expect(choice('powerTrainReset', 400, { powerTrainReset: 'RUNNING' })).toBe('none');
    });

    it('cancels again before a restock-window dock', () => {
        setReferenceKnobs({ RESTOCK_FROM_SECONDS: 640, RESTOCK_UNTIL_SECONDS: 800 });
        expect(choice('powerTrainReset', 500, { powerTrainReset: 'RUNNING' })).toBe('none');
        expect(choice('powerTrainReset', 600, { powerTrainReset: 'RUNNING' })).toBe('lower');
        expect(choice('powerTrainReset', 650, { powerTrainReset: 'RUNNING' })).toBe('none');
    });

    it('never cancels a jump-start, a wind-down or the overhaul itself', () => {
        expect(choice('reactorJumpStart', 310, { reactorJumpStart: 'RUNNING' })).toBe('none');
        expect(choice('powerTrainReset', 310, { powerTrainReset: 'CANCELLING' })).toBe('none');
        expect(choice('feedSystemOverhaul', 310, { feedSystemOverhaul: 'RUNNING' })).toBe('none');
    });
});
