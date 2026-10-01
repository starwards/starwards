import { Control, Display } from './controls';
import { Faction, SmartPilotMode } from '@starwards/core/internal';
import { offNose, verbalReader } from './verbal';
import { brainSpecSchema } from './spec';
import { buildRequest } from './request';

const contact = (id: string, distance: number, bearing: number, extra: Record<string, unknown> = {}) => ({
    id,
    name: id,
    scanLevel: 'BASIC',
    distance,
    bearing,
    type: 'Spaceship',
    faction: Faction.Raiders,
    ...extra,
});

const system = (name: string, extra: Record<string, unknown> = {}) => ({
    name,
    status: 'OK',
    heatStatus: 'OK',
    power: 1,
    coolantFactor: 0.5,
    heat: 10,
    broken: false,
    effectiveness: 1,
    ...extra,
});

const radarDisplay = (contacts: unknown[], panels: Record<string, unknown> = {}): Display => ({
    panels,
    radar: { ownShip: { id: 'me', heading: 90 }, contacts, total: contacts.length },
});

describe('offNose', () => {
    it('is positive to the right and negative to the left', () => {
        expect(offNose(100, 90)).toBe(10);
        expect(offNose(80, 90)).toBe(-10);
    });
    it('wraps around 0/360', () => {
        expect(offNose(5, 355)).toBe(10);
        expect(offNose(355, 5)).toBe(-10);
        expect(offNose(180, 0)).toBe(-180);
    });
});

describe('verbal radar', () => {
    it('says no contacts on an empty radar', () => {
        expect(verbalReader(1)(radarDisplay([]))).toEqual(['Radar: no contacts.']);
    });

    it('marks the contact the weapons are locked on, from targeting-status', () => {
        const lines = verbalReader(1)(
            radarDisplay([contact('enemy', 2000, 102), contact('other', 3000, 70)], {
                'targeting-status': { targetId: 'enemy', shipOnly: true, enemyOnly: false, shortRangeOnly: false },
            }),
        );
        expect(lines[0]).toBe('Contact enemy (LOCKED): Raiders Spaceship, 2,000 m, 12° right of the nose.');
        expect(lines[1]).toBe('Contact other: Raiders Spaceship, 3,000 m, 20° left of the nose.');
        expect(lines).toContain('Weapons locked on enemy.');
    });

    it('counts own shells instead of listing them', () => {
        const lines = verbalReader(1)(
            radarDisplay([
                contact('s1', 100, 90, { type: 'Projectile' }),
                contact('s2', 200, 90, { type: 'Projectile' }),
            ]),
        );
        expect(lines).toEqual(['Radar: no contacts.', '2 of our own shells in flight.']);
    });

    it('calls UFO-level contacts unidentified', () => {
        const [line] = verbalReader(1)(radarDisplay([contact('blip', 20_000, 90, { scanLevel: 'UFO' })]));
        expect(line).toBe('Contact blip: unidentified, 20 km, dead on the nose.');
    });

    it('says closing, opening or holding from the previous reading', () => {
        const read = verbalReader(2);
        read(radarDisplay([contact('a', 1000, 90), contact('b', 1000, 90), contact('c', 1000, 90)]));
        const lines = read(radarDisplay([contact('a', 900, 90), contact('b', 1100, 90), contact('c', 1004, 90)]));
        expect(lines[0]).toMatch(/, closing at 50 m\/s\.$/);
        expect(lines[1]).toMatch(/, opening at 50 m\/s\.$/);
        expect(lines[2]).toMatch(/, holding distance\.$/);
    });

    it('says no trend for a contact first seen this reading', () => {
        const [line] = verbalReader(1)(radarDisplay([contact('a', 1000, 270)]));
        expect(line).toBe('Contact a: Raiders Spaceship, 1,000 m, dead astern.');
    });
});

describe('verbal panels', () => {
    it('reads helms-stats modes in words', () => {
        const lines = verbalReader(1)({
            panels: {
                'helms-stats': {
                    heading: 45,
                    speed: 120,
                    turnSpeed: -10,
                    rotationMode: SmartPilotMode.TARGET,
                    rotationCommand: 0,
                    maneuveringMode: SmartPilotMode.DIRECT,
                    maneuveringCommand: { x: 0.5, y: -0.25 },
                    afterBurner: 0,
                    antiDrift: 1,
                    breaks: 0,
                    energy: 900,
                    afterBurnerFuel: 50,
                },
            },
        });
        expect(lines).toEqual([
            'Heading 45°, speed 120 m/s, turning 10°/s left.',
            'Rotation mode TARGET: the nose follows the weapons target by itself; rotation keys set to 0.00.',
            'Maneuvering mode DIRECT; boost set to 0.50, strafe set to -0.25.',
            'Afterburner off, anti-drift held, brakes off. Energy 900, afterburner fuel 50.',
        ]);
    });

    it('reads systems-status as trouble only, plus a count of normal systems', () => {
        const lines = verbalReader(1)({
            panels: {
                'systems-status': [
                    system('reactor'),
                    system('radar', { broken: true }),
                    system('thrusters', { heatStatus: 'WARNING', heat: 80 }),
                ],
            },
        });
        expect(lines).toEqual([
            'radar: BROKEN, power 100%, coolant 50%, heat 10 (OK), working at 100%',
            'thrusters: OK, power 100%, coolant 50%, heat 80 (WARNING), working at 100%',
            '1 of 3 station systems working normally.',
        ]);
    });

    it('reads full-systems-status listing every system', () => {
        const lines = verbalReader(1)({ panels: { 'full-systems-status': [system('reactor'), system('radar')] } });
        expect(lines).toHaveLength(2);
        expect(lines[0]).toMatch(/^reactor: OK/);
        expect(lines[1]).toMatch(/^radar: OK/);
    });

    it('says a panel the console could not read is unreadable', () => {
        expect(verbalReader(1)({ panels: { 'gun-status': { unreadable: 'no such system' } } })).toEqual([
            'gun-status: unreadable.',
        ]);
    });
});

describe('buildRequest with a verbal brain', () => {
    const spec = brainSpecSchema.parse({
        id: 'helms',
        version: 1,
        station: 'helms',
        model: 'm',
        decisionSeconds: 1,
        role: 'pilot',
        mission: 'kill',
        view: 'verbal',
    });
    const control: Control = {
        id: 'boost',
        command: 'boost',
        options: { forward: 'f', hold: 'h' },
        rest: 'hold',
        press: () => undefined,
    };
    const display = radarDisplay([]);

    it('sends the reading as console and not the display, and the instructions name console', () => {
        const request = buildRequest(spec, display, [control], verbalReader(1)(display));
        expect(request.state.console).toEqual(['Radar: no contacts.']);
        expect(request.state).not.toHaveProperty('display');
        expect(request.questions.boost.instructions).toContain('`console`');
        expect(request.questions.boost.instructions).not.toContain('`display`');
    });
});
