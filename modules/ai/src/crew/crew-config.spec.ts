import { CALLOUT_QUESTION, buildRequest, loadBrainSpec, referenceSeatPlan, verbalReader } from '@starwards/bots';
import { loadCrew, readCrewFile } from './crew-config';
import path from 'node:path';

const crewFile = (name: string) => path.resolve(__dirname, '../../crews', `${name}.json`);

describe('the curriculum reference crew', () => {
    it('seats exactly the reference seats @starwards/bots builds', () => {
        const crew = loadCrew(crewFile('reference'));
        for (const seat of crew.seats) {
            const reference = referenceSeatPlan(seat.station);
            expect(seat.spec).toEqual(reference.spec);
            expect(seat.policy.name).toBe(reference.policy.name);
        }
    });
});

describe('the Jev captain crew', () => {
    it('asks the Jev captain only its callout question, read out from the dradis console', () => {
        const { spec } = readCaptain();
        const display = {
            panels: { 'systems-status': [], 'waypoint-groups': {} },
            radar: {
                ownShip: { id: 'GVTS', heading: 0, faction: 1, position: { x: 0, y: 0 } },
                contacts: [
                    {
                        id: 'target',
                        name: 'target',
                        scanLevel: 'BASIC',
                        type: 'Spaceship',
                        faction: 2,
                        distance: 40_000,
                        bearing: 30,
                        radius: 11,
                    },
                ],
            },
        };
        const request = buildRequest(spec, display, [], verbalReader(spec.decisionSeconds)(display), [
            { speaker: 'signals', callout: 'enemy_position', phrase: 'enemy target at 40.0 km', secondsAgo: 1 },
        ]);
        expect(Object.keys(request.questions)).toEqual([CALLOUT_QUESTION]);
        expect(request.questions[CALLOUT_QUESTION].instructions).toMatch(/On the radio: Signals said/);
        expect((request.state.console as string[]).join(' ')).toMatch(/target/);
    });
});

function readCaptain() {
    const crew = readCrewFile(crewFile('jev-captain-c1-ref'));
    const seat = crew.seats.find((s) => s.station === 'captain')!;
    expect(seat.policy).toBe('jev');
    return { spec: loadBrainSpec(seat.brainPath) };
}
