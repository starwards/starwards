import { Capabilities, Display, stationControls } from './controls';
import { EngineerPolicyName, makeEngineerPolicy } from './engineer-policies';

import { BrainRequest } from './request';
import { makeReferencePolicy } from './reference-policy';

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
