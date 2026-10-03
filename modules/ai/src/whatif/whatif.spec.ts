import { Capabilities, Control, Display, stationControls } from '../brain/controls';
import { forecastPhrases, whatIfForecaster } from './forecast';
import { noseOnContact, tailGeometry } from './helms';

import { SmartPilotMode } from '@starwards/core/internal';
import { WhatIf } from './whatif';
import { brainSpecSchema } from '../brain/spec';
import { buildRequest } from '../brain/request';
import { energyHeat } from './engineer';
import { gunLine } from './weapons';

const SECONDS = 0.5;

function control(display: Display, command: string, extra: Partial<Capabilities['commands'][number]> = {}): Control {
    const controls = stationControls({
        display,
        capabilities: { commands: [{ command, ...extra }] },
        burstSeconds: SECONDS,
    });
    return controls[0];
}

function effects(whatIf: WhatIf, display: Display, previous: Display | undefined, c: Control) {
    return Object.fromEntries(
        Object.keys(c.options).map((option) => [
            option,
            whatIf({ display, previous, secondsSincePrevious: SECONDS, control: c, option }),
        ]),
    );
}

type HelmsScene = {
    heading?: number;
    contact: { x: number; y: number };
    /** The contact's velocity, shown only as its change of position between the two displays. */
    velocity?: { x: number; y: number };
    stats?: Record<string, unknown>;
};

/** A helms display with the ship at the origin, and the display half a second before it. */
function helms({ heading = 0, contact, velocity = { x: 0, y: 0 }, stats = {} }: HelmsScene) {
    const at = (position: { x: number; y: number }): Display => ({
        panels: {
            'helms-stats': {
                rotationMode: SmartPilotMode.TARGET,
                maneuveringMode: SmartPilotMode.TARGET,
                rotationCommand: 0,
                maneuveringCommand: { x: 0, y: 0 },
                afterBurner: 0,
                turnSpeed: 0,
                ...stats,
            },
        },
        radar: {
            ownShip: { id: 'GVTS', heading, position: { x: 0, y: 0 } },
            contacts: [
                {
                    id: 'e1',
                    name: 'e1',
                    scanLevel: 'BASIC',
                    type: 'Spaceship',
                    position,
                    distance: Math.hypot(position.x, position.y),
                    bearing: (Math.atan2(position.y, position.x) * 180) / Math.PI,
                },
            ],
        },
    });
    return {
        display: at(contact),
        previous: at({ x: contact.x - velocity.x * SECONDS, y: contact.y - velocity.y * SECONDS }),
    };
}

describe('tailGeometry', () => {
    it('predicts range, off-nose angle and the firing position for each boost key', () => {
        // contact 2 km dead ahead, flying straight away at 100 m/s: the firing position is 1500 m ahead
        const { display, previous } = helms({ contact: { x: 2000, y: 0 }, velocity: { x: 100, y: 0 } });
        const boost = control(display, 'boost');
        const e = effects(tailGeometry, display, previous, boost);
        // one step forward is 0.05 of 450 m/s on top of the contact's velocity: 90 m nearer in 4 s
        expect(e.forward?.phrase).toBe(
            'In 4 s: contact 1910 m away, dead on the nose, firing position 1410 m off (not reached within 30 s).',
        );
        expect(e.hold?.phrase).toContain('contact 2000 m away');
        expect(e.hold?.value).toBe(-1500);
        expect(e.forward?.value).toBe(-1410);
        expect(e.back?.value).toBe(-1590);
    });

    it('says when the firing position is reached', () => {
        const { display, previous } = helms({
            contact: { x: 1000, y: 0 },
            velocity: { x: 100, y: 0 },
            stats: { maneuveringCommand: { x: 0.2, y: 0 } },
        });
        // 90 m/s closing on a firing position 500 m ahead: within 150 m of it after 350 m
        expect(effects(tailGeometry, display, previous, control(display, 'boost')).hold?.phrase).toContain(
            'reached in 4 s',
        );
    });

    it('prefers the key that does not fly past the firing position', () => {
        const { display, previous } = helms({
            contact: { x: 600, y: 0 },
            velocity: { x: 100, y: 0 },
            stats: { maneuveringCommand: { x: 0.2, y: 0 } },
        });
        const boost = control(display, 'boost');
        const phrases = forecastPhrases(boost, effects(tailGeometry, display, previous, boost));
        // at 90 m/s the ship would be 260 m past the spot in 4 s; cutting thrust leaves it 100 m short
        expect(phrases.centre).toContain('firing position 100 m off');
        expect(phrases.centre).toMatch(/Best forecast of these options\.$/);
        expect(phrases.hold).not.toContain('Best forecast');
    });

    it('circles with strafe while the nose follows the contact', () => {
        // contact abeam of its own course: the firing position lies to our right
        const { display, previous } = helms({ contact: { x: 500, y: 0 }, velocity: { x: 0, y: -100 } });
        const strafe = control(display, 'strafe');
        const e = effects(tailGeometry, display, previous, strafe);
        expect(e.right!.value!).toBeGreaterThan(e.hold!.value!);
        expect(e.left!.value!).toBeLessThan(e.hold!.value!);
    });

    it('flies the ship at its own commanded speed in maneuvering mode VELOCITY', () => {
        const { display, previous } = helms({
            contact: { x: 2000, y: 0 },
            stats: { maneuveringMode: SmartPilotMode.VELOCITY, maneuveringCommand: { x: 0.5, y: 0 } },
        });
        // a still contact has no tail: the firing position is anywhere 500 m from it
        expect(effects(tailGeometry, display, previous, control(display, 'boost')).hold?.phrase).toContain(
            'contact 1100 m away, dead on the nose, firing position 600 m off',
        );
    });

    it('adds the afterburner speed to what the keys command', () => {
        const { display, previous } = helms({
            contact: { x: 4000, y: 0 },
            stats: { maneuveringCommand: { x: 0.5, y: 0 } },
        });
        const e = effects(tailGeometry, display, previous, control(display, 'afterBurner'));
        expect(e.release?.phrase).toContain('contact 3100 m away');
        expect(e.engage?.phrase).toContain('contact 1900 m away');
    });

    it('says nothing without a previous display, without a contact, or in maneuvering mode DIRECT', () => {
        const { display, previous } = helms({ contact: { x: 2000, y: 0 } });
        const boost = control(display, 'boost');
        expect(effects(tailGeometry, display, undefined, boost).forward).toBeUndefined();
        const empty: Display = { panels: display.panels, radar: { ownShip: { heading: 0 }, contacts: [] } };
        expect(effects(tailGeometry, empty, previous, boost).forward).toBeUndefined();
        const direct = helms({ contact: { x: 2000, y: 0 }, stats: { maneuveringMode: SmartPilotMode.DIRECT } });
        expect(effects(tailGeometry, direct.display, direct.previous, boost).forward).toBeUndefined();
    });

    it('ignores shell-sized blips when choosing the contact to fly on', () => {
        const { display, previous } = helms({ contact: { x: 2000, y: 0 } });
        const shell = { id: 's', name: 's', scanLevel: 'UFO', radius: 1, distance: 50, bearing: 0 };
        const withShell = (d: Display): Display => ({
            ...d,
            radar: {
                ...(d.radar as object),
                contacts: [{ ...shell, position: { x: 50, y: 0 } }, ...(d.radar as { contacts: unknown[] }).contacts],
            },
        });
        const boost = control(display, 'boost');
        expect(effects(tailGeometry, withShell(display), withShell(previous), boost).hold?.phrase).toContain(
            'contact 2000 m away',
        );
    });
});

describe('noseOnContact', () => {
    it('predicts the off-nose angle at the turn rate each rotation key sets', () => {
        const { display, previous } = helms({
            contact: { x: 0, y: 2000 },
            stats: { rotationMode: SmartPilotMode.VELOCITY, maneuveringMode: SmartPilotMode.VELOCITY },
        });
        const rotation = control(display, 'rotation');
        const e = effects(noseOnContact, display, previous, rotation);
        // contact 90° right; one step right is 0.05 of 108°/s, 16° in 3 s
        expect(e.right?.phrase).toBe('In 3 s: contact 74° right of the nose.');
        expect(e.hold?.phrase).toBe('In 3 s: contact 90° right of the nose.');
        expect(forecastPhrases(rotation, e).right).toMatch(/Best forecast of these options\.$/);
    });

    it('says nothing while the nose follows the target by itself', () => {
        const { display, previous } = helms({ contact: { x: 0, y: 2000 } });
        expect(effects(noseOnContact, display, previous, control(display, 'rotation')).right).toBeUndefined();
    });
});

type WeaponsScene = { heading?: number; target?: { x: number; y: number }; locked?: boolean };

function weapons({ heading = 0, target, locked = true }: WeaponsScene): Display {
    return {
        panels: { 'targeting-status': { targetId: locked ? 'e1' : null } },
        radar: {
            ownShip: { id: 'GVTS', heading, position: { x: 0, y: 0 } },
            contacts: target
                ? [{ id: 'e1', name: 'e1', scanLevel: 'BASIC', position: target, distance: 0, bearing: 0 }]
                : [],
        },
    };
}

describe('gunLine', () => {
    const trigger = (display: Display) => control(display, 'fireChainGun', { count: 1 });

    it('says shells hit while the locked target is on the gun line now and in a second', () => {
        const display = weapons({ target: { x: 1000, y: 40 } });
        const previous = weapons({ target: { x: 1000, y: 30 } });
        const e = effects(gunLine, display, previous, trigger(display));
        // drifting 20 m/s across: 60 m off in 1 s, still inside the blast
        expect(e.fire?.phrase).toBe(
            'The locked target is 40 m off the gun line now and 60 m off the gun line in 1 s (a blast reaches 100 m): shells fired now hit.',
        );
        expect(e.fire?.value).toBe(1);
        expect(e.hold_fire?.value).toBe(0);
        expect(forecastPhrases(trigger(display), e).fire).toMatch(/Best forecast of these options\.$/);
    });

    it('says shells miss while the target is off the gun line, and marks holding fire best', () => {
        const display = weapons({ target: { x: 1000, y: 300 } });
        const c = trigger(display);
        const e = effects(gunLine, display, display, c);
        expect(e.fire?.phrase).toContain('shells fired now miss');
        expect(forecastPhrases(c, e).hold_fire).toMatch(/Best forecast of these options\.$/);
    });

    it('sees the nose sweeping off the target', () => {
        const display = weapons({ target: { x: 1000, y: 0 }, heading: 2 });
        const previous = weapons({ target: { x: 1000, y: 0 }, heading: 0 });
        // turning 4°/s: 6° off in 1 s, 105 m at 1 km
        expect(effects(gunLine, display, previous, trigger(display)).fire?.phrase).toContain(
            'it is leaving the gun line',
        );
    });

    it('reads only now without a previous display', () => {
        const display = weapons({ target: { x: 1000, y: 40 } });
        expect(effects(gunLine, display, undefined, trigger(display)).fire?.phrase).toBe(
            'The locked target is 40 m off the gun line now (a blast reaches 100 m): shells fired now hit.',
        );
    });

    it('calls shells wasted without a lock the radar shows, or beyond their reach', () => {
        const unlocked = weapons({ target: { x: 1000, y: 0 }, locked: false });
        expect(effects(gunLine, unlocked, undefined, trigger(unlocked)).fire).toEqual({
            phrase: 'No locked target on the radar: shells fired now are wasted.',
            value: -1,
        });
        const far = weapons({ target: { x: 9000, y: 0 } });
        expect(effects(gunLine, far, undefined, trigger(far)).fire?.phrase).toContain('beyond the shells');
    });
});

type SystemRow = { pointer: string; power: number; coolantFactor: number; heat: number; energyPerMinute: number };

function engineer(energy: number, systems: SystemRow[]): Display {
    return { panels: { 'engineering-status': { energy, maxEnergy: 1000 }, 'full-systems-status': systems } };
}

describe('energyHeat', () => {
    const thruster = (over: Partial<SystemRow> = {}): SystemRow => ({
        pointer: '/thrusters/0',
        power: 0.5,
        coolantFactor: 0,
        heat: 0,
        energyPerMinute: 120,
        ...over,
    });
    const reactor: SystemRow = { pointer: '/reactor', power: 0.5, coolantFactor: 1, heat: 0, energyPerMinute: 600 };
    const systems = { systems: ['/thrusters/0', '/reactor'] };

    it('predicts the energy store from its displayed trend and the scaled draw of a power step', () => {
        // the store fell 2 in half a second: 4 per second, 40 in 10 s
        const display = engineer(500, [thruster(), reactor]);
        const previous = engineer(502, [thruster(), reactor]);
        const e = effects(energyHeat, display, previous, control(display, 'systemPower', systems));
        expect(e.hold?.phrase).toBe("In 10 s: energy store 460 of 1000, this system's heat 0 of 100.");
        // LOW power halves the thruster's 2 per second
        expect(e.lower?.phrase).toContain('energy store 470 of 1000');
        // HIGH power draws 3 per second and heats 1.5 per second
        expect(e.raise?.phrase).toBe("In 10 s: energy store 450 of 1000, this system's heat 15 of 100.");
        expect(e.raise?.value).toBeUndefined();
    });

    it('counts a reactor step as generation', () => {
        const display = engineer(500, [thruster(), reactor]);
        const power = stationControls({
            display,
            capabilities: { commands: [{ command: 'systemPower', ...systems }] },
            burstSeconds: SECONDS,
        }).find((c) => c.id === 'systemPower:/reactor')!;
        // the reactor's 10 per second becomes 5 at LOW
        expect(effects(energyHeat, display, display, power).lower?.phrase).toContain('energy store 450 of 1000');
    });

    it('predicts heat from its displayed trend and the re-shared coolant', () => {
        // heating 1 per second with no coolant share (the reactor holds it all)
        const display = engineer(500, [thruster({ heat: 50 }), reactor]);
        const previous = engineer(500, [thruster({ heat: 49.5 }), reactor]);
        const e = effects(energyHeat, display, previous, control(display, 'systemCoolant', systems));
        expect(e.hold?.phrase).toBe("In 10 s: this system's heat 60 of 100.");
        // a 0.1 share against the reactor's 1 takes 10 × 0.1 / 1.1 off per second
        expect(e.raise?.phrase).toBe("In 10 s: this system's heat 51 of 100.");
    });

    it('flags an overheat and says nothing without a previous display', () => {
        const display = engineer(500, [thruster({ heat: 95 }), reactor]);
        const previous = engineer(500, [thruster({ heat: 94 }), reactor]);
        const coolant = control(display, 'systemCoolant', systems);
        expect(effects(energyHeat, display, previous, coolant).hold?.phrase).toContain('100 of 100 (OVERHEATS)');
        expect(effects(energyHeat, display, undefined, coolant).hold).toBeUndefined();
    });
});

describe('what-if in a request', () => {
    const spec = brainSpecSchema.parse({
        id: 'helms',
        version: 1,
        station: 'helms',
        model: 'jev-1.13.0',
        decisionSeconds: SECONDS,
        role: 'r',
        mission: 'm',
        controls: {
            boost: { whatIf: 'tailGeometry', options: { forward: 'raise thrust.' } },
            strafe: { whatIf: 'tailGeometry', skip: true },
        },
    });
    const capabilities: Capabilities = { commands: [{ command: 'boost' }, { command: 'strafe' }] };
    const { display, previous } = helms({ contact: { x: 2000, y: 0 }, velocity: { x: 100, y: 0 } });
    const controls = stationControls({ display, capabilities, burstSeconds: SECONDS });

    it('appends each option forecast to its description, from the second display on', () => {
        const forecast = whatIfForecaster(spec)!;
        const first = buildRequest(spec, previous, controls, undefined, undefined, forecast(previous, controls));
        expect(first.questions.boost.criteria.forward).toBe('raise thrust.');
        const second = buildRequest(spec, display, controls, undefined, undefined, forecast(display, controls));
        expect(second.questions.boost.criteria.forward).toBe(
            'raise thrust. In 4 s: contact 1910 m away, dead on the nose, firing position 1410 m off (not reached within 30 s). Best forecast of these options.',
        );
        expect(second.questions.boost.criteria.hold).toMatch(/^leave it as it is\. In 4 s: contact 2000 m away/);
        expect(second.questions.strafe).toBeUndefined();
    });

    it('is opt-in: a brain naming no plug-in gets no forecaster and an unchanged request', () => {
        const plain = brainSpecSchema.parse({ ...spec, controls: { boost: {} } });
        expect(whatIfForecaster(plain)).toBeUndefined();
        expect(buildRequest(plain, display, controls).questions.boost.criteria.forward).toBe(
            'press the forward key once (one step of 0.05)',
        );
    });

    it('rejects a brain file naming an unknown plug-in', () => {
        expect(() => brainSpecSchema.parse({ ...spec, controls: { boost: { whatIf: 'crystalBall' } } })).toThrow();
    });

    it('marks no option best when fewer than two carry an indicator, and breaks ties toward pressing nothing', () => {
        const boost = controls.find((c) => c.id === 'boost')!;
        expect(forecastPhrases(boost, { forward: { phrase: 'a', value: 1 }, hold: { phrase: 'b' } })).toEqual({
            forward: 'a',
            hold: 'b',
        });
        expect(
            forecastPhrases(boost, { forward: { phrase: 'a', value: 1 }, hold: { phrase: 'b', value: 1 } }).hold,
        ).toBe('b Best forecast of these options.');
    });
});
