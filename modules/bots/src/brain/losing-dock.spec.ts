import { calloutMemory, referenceCallout } from './reference-orders';
import { BrainRequest } from './request';
import { CALLOUT_QUESTION } from './callout';
import { Display } from './controls';
import { setReferenceKnobs } from './reference-knobs';

const request = {
    state: {},
    questions: {
        [CALLOUT_QUESTION]: {
            type: 'choice',
            instructions: '',
            criteria: { undock: '', dock_for_repair: '', hold_here: '' },
        },
    },
} as unknown as BrainRequest;

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

/** The captain's dradis: `stations` allied stations, and an enemy `gap` metres from the first one. */
function dradis(stations: number, gap?: number): Display {
    const allies = [station('a', 0), station('b', 50_000), station('c', 100_000)].slice(0, stations);
    const enemy = {
        id: 'r',
        name: 'r',
        type: 'Spaceship',
        faction: 2,
        distance: 9_000,
        bearing: 90,
        position: { x: gap ?? 0, y: 0 },
    };
    return {
        panels: {},
        radar: {
            ownShip: { id: 'GVTS', heading: 0, faction: 1, position: { x: 0, y: 4_000 } },
            contacts: gap === undefined ? allies : [...allies, enemy],
        },
    };
}

/** Plays the captain 5 s a decision; `dockOrdered` follows its own dock and undock calls. */
function captain() {
    const state = calloutMemory();
    let docked = false;
    return (shown: Display) => {
        const choice = referenceCallout(request, shown, undefined, 5, undefined, {
            state,
            dockOrdered: docked,
        })?.choice;
        if (choice === 'dock_for_repair') docked = true;
        if (choice === 'undock') docked = false;
        return choice;
    };
}

describe('losing → dock (DOCK_LOSING_*)', () => {
    afterEach(() => setReferenceKnobs());

    it('docks once an enemy sat near a station for the knob seconds of the last minute, after the gate', () => {
        setReferenceKnobs({ DOCK_LOSING_ATTACK_SECONDS: 30, DOCK_LOSING_AFTER_SECONDS: 40 });
        const say = captain();
        const said = Array.from({ length: 20 }, () => say(dradis(3, 5_000)));
        // t=5..: 30 s of attack by t=30, but the gate holds it to t=40
        expect(said.indexOf('dock_for_repair')).toBe(7);
        expect(said.filter((c) => c === 'dock_for_repair')).toHaveLength(1);
    });

    it('does not count an enemy beyond ATTACK_METERS, and is off by default', () => {
        setReferenceKnobs({ DOCK_LOSING_ATTACK_SECONDS: 30, DOCK_LOSING_AFTER_SECONDS: 0, ATTACK_METERS: 3_000 });
        const far = captain();
        expect(Array.from({ length: 20 }, () => far(dradis(3, 5_000)))).not.toContain('dock_for_repair');
        setReferenceKnobs();
        const off = captain();
        expect(Array.from({ length: 200 }, () => off(dradis(1, 1_000)))).not.toContain('dock_for_repair');
    });

    it('docks when allied stations drop off the dradis below the knob share of the most seen', () => {
        setReferenceKnobs({ DOCK_LOSING_STATION_HP: 0.5, DOCK_LOSING_AFTER_SECONDS: 0 });
        const say = captain();
        expect(say(dradis(3))).toBe('hold_here');
        expect(say(dradis(2))).toBe('hold_here'); // 2/3 left
        expect(say(dradis(1))).toBe('dock_for_repair'); // 1/3 left
    });

    it('stays docked through the hold before the usual undock rule casts off', () => {
        setReferenceKnobs({ DOCK_LOSING_STATION_HP: 0.5, DOCK_LOSING_AFTER_SECONDS: 0 });
        const say = captain();
        say(dradis(3));
        expect(say(dradis(1))).toBe('dock_for_repair'); // t=10
        const after = Array.from({ length: 30 }, () => say(dradis(1)));
        // t=15..: held to t=130, then shells are not low so it casts off
        expect(after.indexOf('undock')).toBe(23);
    });
});
