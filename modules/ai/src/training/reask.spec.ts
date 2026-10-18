import { Heard, referenceSeatPlan } from '@starwards/bots';
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
const request = (heard: Heard[]): RecordedRequest => ({
    t: 10,
    station: 'helms',
    brain: 'helms',
    version: 1,
    specHash: 'x',
    policy: 'reference',
    display,
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
    it('re-decides with the captain`s orders the seat heard at that decision', async () => {
        const { spec, policy } = referenceSeatPlan('helms');
        const [heardIt] = await reask(spec, policy, [request([closeTo])], recorded);
        expect(heardIt.after).toBe('right');
        const [deaf] = await reask(spec, referenceSeatPlan('helms').policy, [request([])], recorded);
        expect(deaf.after).toBe('centre');
    });
});
