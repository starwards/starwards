import { Capabilities, Display, stationControls } from './controls';
import { REFERENCE_HELMS, makeReferencePolicy } from './reference-policy';

import { BrainRequest } from './request';
import { ORDERS_PANEL } from '../crew/orders';
import { Policy } from './brain';
import { brainSpecSchema } from './spec';
import helms from '../brains/helms.v1.json';
import { referenceSeat } from '../reference-crew';
import { testBoard } from '../crew/orders.fixtures';

const capabilities: Capabilities = {
    commands: ['rotation', 'strafe', 'boost', 'antiDrift', 'rotationMode'].map((command) => ({ command })),
};

const contact = (id: string, x: number, y: number) => ({
    id,
    name: id,
    type: 'Spaceship',
    scanLevel: 'BASIC',
    faction: 2,
    radius: 20,
    position: { x, y },
    distance: Math.hypot(x, y),
    bearing: (Math.atan2(y, x) * 180) / Math.PI,
});

/**
 * The GVTS at the origin facing 0°: a still raider `near` 1 km ahead, and the raider `far` 6 km off
 * at bearing 90° that the captain's focus order names.
 */
function display(): Display {
    return {
        panels: {
            'helms-stats': {
                rotationMode: 1,
                maneuveringMode: 1,
                rotationCommand: 0,
                maneuveringCommand: { x: 0, y: 0 },
                antiDrift: 0,
            },
            [ORDERS_PANEL]: testBoard().give([
                { kind: 'focus', params: { targets: [{ name: 'far' }, { name: 'near' }] } },
            ]).shown,
        },
        radar: {
            ownShip: { id: 'GVTS', heading: 0, faction: 1, position: { x: 0, y: 0 } },
            contacts: [contact('near', 1000, 0), contact('far', 0, 6000)],
        },
    };
}

async function choices(policy: Policy) {
    const shown = display();
    const controls = stationControls({ display: shown, capabilities, burstSeconds: 1 });
    const { answers } = await policy.answer({} as BrainRequest, controls, shown, []);
    return Object.fromEntries(Object.entries(answers).map(([id, a]) => [id, a.choice]));
}

describe('reference helms parks on the engaged enemy', () => {
    it('without it, parks on the nearest enemy whatever the captain engages', async () => {
        expect(await choices(makeReferencePolicy(1))).toMatchObject({ rotation: 'centre', strafe: 'hold' });
    });

    it('turns and flies toward the enemy the focus order names, past a nearer one', async () => {
        const policy = makeReferencePolicy(1, undefined, 'reference', { ...REFERENCE_HELMS, parkOnEngaged: true });
        const picked = await choices(policy);
        expect(picked.rotation).not.toBe('centre');
        expect(picked.strafe).not.toBe('hold');
    });

    it('a helms brain opts in with parkOnEngaged', async () => {
        const seat = referenceSeat(brainSpecSchema.parse({ ...helms, parkOnEngaged: true }));
        expect((await choices(seat.policy)).rotation).not.toBe('centre');
    });
});
