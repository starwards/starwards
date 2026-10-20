import { Heard, ORDERS_PANEL, OrdersBoard, referenceSeatPlan } from '@starwards/bots';
import { RecordedDecision, RecordedRequest } from './decision-log';

import { reask } from './reask';

const display = {
    panels: {
        'helms-stats': {
            rotationMode: 1,
            maneuveringMode: 1,
            rotationCommand: 0,
            maneuveringCommand: { x: 0, y: 0 },
            antiDrift: 0,
        },
    },
    radar: { ownShip: { id: 'GVTS', heading: 0, faction: 1, position: { x: 0, y: 0 } }, contacts: [] },
};
const closeTo: Heard = {
    speaker: 'captain',
    callout: 'close_to',
    phrase: 'close to 2 km of raider, now 50.0 km at bearing 090',
    values: { name: 'raider', range: '2', distance: '50.0', bearing: '090' },
    secondsAgo: 0.5,
};
const board: OrdersBoard = {
    orders: [
        {
            id: 1,
            slot: 'maneuver',
            kind: 'close_to',
            params: { target: { name: 'raider', position: { x: 0, y: 50_000 } }, range: 2000 },
            issuer: 'captain',
            origin: '',
            issuedAt: 9.5,
            binds: ['helms'],
            status: 'active',
            fired: false,
            secondsAgo: 0.5,
            words: 'close to 2.0 km of raider',
        },
    ],
    priorities: ['repair', 'navigation', 'engagement', 'energy', 'maneuver', 'stance', 'sensors'],
};
const request = (heard: Heard[], orders?: OrdersBoard): RecordedRequest => ({
    t: 10,
    station: 'helms',
    brain: 'helms',
    version: 1,
    specHash: 'x',
    policy: 'reference',
    display: orders ? { ...display, panels: { ...display.panels, [ORDERS_PANEL]: orders } } : display,
    capabilities: { commands: [{ command: 'rotation' }] },
    heard,
});
const recorded: RecordedDecision[] = [
    {
        t: 10,
        station: 'helms',
        brain: 'helms',
        version: 1,
        policy: 'reference',
        control: 'rotation',
        choice: 'centre',
        source: 'rule',
        pressed: false,
    },
];

describe('reask', () => {
    it('re-decides with the order board the seat read at that decision', async () => {
        const { spec, policy } = referenceSeatPlan('helms');
        const [ordered] = await reask(spec, policy, [request([closeTo], board)], recorded);
        expect(ordered.after).toBe('right');
        const [heardOnly] = await reask(spec, referenceSeatPlan('helms').policy, [request([closeTo])], recorded);
        expect(heardOnly.after).toBe('centre');
    });
});
