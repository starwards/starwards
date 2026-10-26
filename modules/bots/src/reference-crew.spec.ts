import { Capabilities, Display, stationControls } from './brain/controls';
import { referenceSeat, referenceSeatPlan } from './reference-crew';

import { BrainRequest } from './brain/request';

describe('referenceSeatPlan', () => {
    it.each(['helms', 'weapons', 'engineer', 'signals', 'tactical'])('plays %s with its v1 brain', (station) => {
        const plan = referenceSeatPlan(station);
        expect(plan.station).toBe(station);
        expect(plan.spec.station).toBe(station);
        expect(plan.policy.name).toBe('reference');
    });

    it('has no brain for a station without one', () => {
        expect(() => referenceSeatPlan('dradis')).toThrow('no reference brain for station "dradis"');
    });
});

describe('referenceSeat', () => {
    it('plays a brain with the reference policy', () => {
        const { spec } = referenceSeatPlan('weapons');
        const seat = referenceSeat(spec);
        expect(seat).toMatchObject({ station: 'weapons', spec });
        expect(seat.policy.name).toBe('reference');
    });
});

describe('an engineer brain that repairs any system', () => {
    const capabilities: Capabilities = { commands: [{ command: 'cycleRepairPriority' }] };
    const shown: Display = {
        panels: {
            'full-systems-status': [],
            'engineering-status': { energy: 800, maxEnergy: 1000, energyCells: 2 },
            'repair-queue': { slots: [{ protocolId: 'feedSystemOverhaul', priority: 'OFF', refusalReason: '' }] },
            'damage-report': [{ system: '/magazine', field: 'capacity', value: 0.1, normal: 1 }],
        },
    };

    async function queued(repairs?: 'all') {
        const { spec } = referenceSeatPlan('engineer');
        const seat = referenceSeat({ ...spec, repairs });
        const controls = stationControls({ display: shown, capabilities, burstSeconds: 1 });
        return (await seat.policy.answer({} as BrainRequest, controls, shown)).answers[
            'cycleRepairPriority:feedSystemOverhaul'
        ]?.choice;
    }

    it('queues the magazine repair that the reactor-only reference leaves', async () => {
        expect(await queued()).toBe('none');
        expect(await queued('all')).toBe('raise');
    });
});
