import {
    CALLOUT_QUESTION,
    buildRequest,
    loadBrainSpec,
    referenceSeatPlan,
    setReferenceKnobs,
    verbalReader,
} from '@starwards/bots';
import { loadCrew, readCrewFile } from './crew-config';
import fs from 'node:fs';
import os from 'node:os';
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

describe('the losing → dock crews', () => {
    afterEach(() => setReferenceKnobs());

    const station = (name: string, x: number) => ({
        id: name,
        name,
        type: 'Spaceship',
        faction: 1,
        radius: 1_200,
        distance: 4_000,
        bearing: 0,
        position: { x, y: 0 },
    });
    const dradis = (stations: number) => ({
        panels: {},
        radar: {
            ownShip: { id: 'GVTS', heading: 0, faction: 1, position: { x: 0, y: 4_000 } },
            contacts: [station('a', 0), station('b', 50_000), station('c', 100_000)].slice(0, stations),
        },
    });

    it.each(['captain-reference-guard-losedock-hp35', 'captain-reference-guard-losedock-hp50'])(
        '%s: its captain orders the dock once allied stations fall below the knob share',
        async (name) => {
            const crew = loadCrew(crewFile(name));
            setReferenceKnobs({ ...readCrewFile(crewFile(name)).knobs, DOCK_LOSING_AFTER_SECONDS: 0 });
            const { spec, policy } = crew.seats.find((s) => s.station === 'captain')!;
            const say = async (stations: number) => {
                const shown = dradis(stations);
                const request = buildRequest(spec, shown, [], verbalReader(spec.decisionSeconds)(shown), []);
                return (await policy.answer(request, [], shown, [])).answers[CALLOUT_QUESTION]?.choice;
            };
            await say(3);
            expect(await say(1)).toBe('dock_for_repair');
        },
    );

    it('refuses a DOCK_LOSING_* knob on a captain brain that cannot say dock_for_repair', () => {
        const file = path.join(os.tmpdir(), `losedock-nodock-${process.pid}.json`);
        fs.writeFileSync(
            file,
            JSON.stringify({
                name: 'nodock',
                seats: [{ station: 'captain', policy: 'reference', brain: crewFile('../brains/captain.v17') }],
                knobs: { DOCK_LOSING_STATION_HP: 0.5 },
            }),
        );
        try {
            expect(() => loadCrew(file)).toThrow(/dock_for_repair/);
        } finally {
            fs.unlinkSync(file);
        }
    });
});
