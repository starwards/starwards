import { BrainSpec } from './spec';
import { Display } from './controls';
import { calloutSaid } from './callout';
import { orderFromCallout } from '../crew/orders';

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
        defend_close_to: { say: 'close to {range} km of {name}, near {station}', when: 'w', fill: 'threatCloseOrder' },
        defend_engage: { say: 'engage {name}', when: 'w', fill: 'threatEngageOrder' },
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

describe('station-threat fills', () => {
    // the raider nearest us is 5 km off; the one nearest a station is 60 km off, 3 km from it
    const picture = dradis([
        station('large', 0, 60_000),
        raider('shadow', 5_000, 0),
        raider('striker', 3_000, 60_000),
        { ...station('picket', 1_000, 0), radius: 20 },
    ]);

    it('names the enemy nearest any allied station, not the nearest to us', () => {
        expect(calloutSaid(spec, 'defend_engage', picture)?.values).toEqual({ name: 'striker' });
        expect(calloutSaid(spec, 'defend_close_to', picture)?.values).toMatchObject({
            name: 'striker',
            station: 'large',
            distance: '60.1',
            bearing: '087',
        });
    });

    it('a ship-sized ally is no station to defend', () => {
        const values = calloutSaid(
            spec,
            'defend_engage',
            dradis([{ ...station('picket', 1_000, 0), radius: 20 }, raider('a', 1_100, 0)]),
        )?.values;
        expect(values).toBeUndefined();
    });

    it('defend_close_to and defend_engage give close_to and engage orders', () => {
        expect(orderFromCallout('defend_engage', { name: 'striker' }, { x: 0, y: 0 })).toEqual({
            kind: 'engage',
            params: { target: { name: 'striker' } },
        });
        expect(
            orderFromCallout(
                'defend_close_to',
                { name: 'striker', range: '2', distance: '60.1', bearing: '087' },
                {
                    x: 0,
                    y: 0,
                },
            ),
        ).toMatchObject({ kind: 'close_to', params: { range: 2000, target: { name: 'striker' } } });
    });
});
