import { BrainSpec } from './spec';
import { Display } from './controls';
import { calloutSaid } from './callout';

const spec = {
    id: 'captain-mission',
    version: 1,
    station: 'captain',
    model: 'm',
    decisionSeconds: 5,
    minConfidence: 0,
    role: 'r',
    mission: 'm',
    controls: {},
    callouts: {
        dock_for_repair: { say: 'dock at {name}, {distance} km at bearing {bearing}', when: 'w', fill: 'dockOrder' },
    },
} as unknown as BrainSpec;

function dradis(contacts: object[]): Display {
    return {
        panels: {},
        radar: { ownShip: { id: 'GVTS', heading: 0, faction: 1, position: { x: 0, y: 0 } }, contacts },
    };
}

describe('dockOrder fill', () => {
    it('names the nearest allied station the dradis shows, its distance and world bearing', () => {
        const said = calloutSaid(
            spec,
            'dock_for_repair',
            dradis([
                {
                    id: 'picket',
                    name: 'picket',
                    type: 'Spaceship',
                    faction: 1,
                    radius: 20,
                    distance: 1_000,
                    bearing: 10,
                },
                { id: 'far', name: 'far', type: 'Spaceship', faction: 1, radius: 1_200, distance: 9_000, bearing: 10 },
                {
                    id: 'dock',
                    name: 'dock',
                    type: 'Spaceship',
                    faction: 1,
                    radius: 1_200,
                    distance: 4_320,
                    bearing: 270,
                },
                {
                    id: 'raider',
                    name: 'raider',
                    type: 'Spaceship',
                    faction: 2,
                    radius: 1_200,
                    distance: 100,
                    bearing: 0,
                },
            ]),
        );
        expect(said?.values).toEqual({ name: 'dock', distance: '4.3', bearing: '270', radius: '1.2' });
    });

    it('says nothing without an allied station in sight', () => {
        expect(calloutSaid(spec, 'dock_for_repair', dradis([]))).toBeUndefined();
    });
});
