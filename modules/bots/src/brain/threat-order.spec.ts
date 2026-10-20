import { BrainSpec } from './spec';
import { Display } from './controls';
import { calloutSaid } from './callout';

const spec = {
    id: 'captain-waves',
    version: 1,
    station: 'captain',
    model: 'm',
    decisionSeconds: 5,
    minConfidence: 0,
    role: 'r',
    mission: 'm',
    controls: {},
    callouts: {
        focus: { say: 'focus {focus}', when: 'w', fill: 'focusOrder' },
    },
} as unknown as BrainSpec;

const station = (name: string, x: number, y: number) => ({
    id: name,
    name,
    type: 'Spaceship',
    faction: 1,
    radius: 1_200,
    position: { x, y },
    distance: Math.hypot(x, y),
    bearing: (Math.atan2(y, x) * 180) / Math.PI,
});
const raider = (name: string, x: number, y: number) => ({ ...station(name, x, y), faction: 2, radius: 20 });

function dradis(contacts: object[]): Display {
    return {
        panels: {},
        radar: { ownShip: { id: 'GVTS', heading: 0, faction: 1, position: { x: 0, y: 0 } }, contacts },
    };
}

describe('focusOrder station threat', () => {
    it('names the enemy nearest any allied station first, not the nearest to us', () => {
        // the raider nearest us is 5 km off; the one nearest a station is 60 km off, 3 km from it
        const picture = dradis([
            station('large', 0, 60_000),
            raider('shadow', 5_000, 0),
            raider('striker', 3_000, 60_000),
            { ...station('picket', 1_000, 0), radius: 20 },
        ]);
        expect(calloutSaid(spec, 'focus', picture)?.values).toMatchObject({
            names: 'striker, shadow',
            pick: 'nearest_to',
            station: 'large',
        });
    });

    it('a ship-sized ally is no station to defend', () => {
        const values = calloutSaid(
            spec,
            'focus',
            dradis([{ ...station('picket', 1_000, 0), radius: 20 }, raider('a', 1_100, 0)]),
        )?.values;
        expect(values).toEqual({ names: 'a', focus: 'a' });
    });
});
