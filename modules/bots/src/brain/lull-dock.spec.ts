import { CALLOUT_QUESTION, Heard } from './callout';
import { calloutMemory, referenceCallout } from './reference-orders';
import { BrainRequest } from './request';
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

/** The captain's dradis: one allied station at the origin, and an enemy `gap` metres from it. */
function dradis(gap?: number): Display {
    const station = {
        id: 's',
        name: 's',
        type: 'Spaceship',
        faction: 1,
        radius: 1_200,
        distance: 4_000,
        bearing: 0,
        position: { x: 0, y: 0 },
    };
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
            contacts: gap === undefined ? [station] : [station, enemy],
        },
    };
}

const salvoAway = (magazine: number): Heard => ({
    speaker: 'weapons',
    callout: 'salvo_away',
    phrase: '',
    values: { n: '1', in_flight: '1', magazine: String(magazine) },
    secondsAgo: 1,
});

/** Plays the captain 5 s a decision; `dockOrdered` follows its own dock and undock calls. */
function captain() {
    const state = calloutMemory();
    let docked = false;
    return (shown: Display, heard: Heard[] = []) => {
        const choice = referenceCallout(request, shown, undefined, 5, undefined, {
            state,
            heard,
            dockOrdered: docked,
        })?.choice;
        if (choice === 'dock_for_repair') docked = true;
        if (choice === 'undock') docked = false;
        return choice;
    };
}

describe('lull → dock (LULL_DOCK_*)', () => {
    afterEach(() => setReferenceKnobs());

    it('is off by default', () => {
        const say = captain();
        say(dradis(), [salvoAway(0)]);
        expect(Array.from({ length: 300 }, () => say(dradis()))).not.toContain('dock_for_repair');
    });

    it('docks once inside the window when weapons last called at most k missiles left and no enemy is near a station', () => {
        setReferenceKnobs({ LULL_DOCK_MISSILES: 2, LULL_DOCK_FROM_SECONDS: 20, LULL_DOCK_UNTIL_SECONDS: 100 });
        const say = captain();
        expect(say(dradis(), [salvoAway(3)])).toBe('hold_here'); // t=5, 3 left
        expect(say(dradis(), [salvoAway(2)])).toBe('hold_here'); // t=10, 2 left but before the window
        const said = Array.from({ length: 20 }, () => say(dradis()));
        expect(said.indexOf('dock_for_repair')).toBe(1); // t=20
        expect(said.filter((c) => c === 'dock_for_repair')).toHaveLength(1);
    });

    it('does not dock above k, after the window, or while an enemy is within the clear range of a station', () => {
        setReferenceKnobs({
            LULL_DOCK_MISSILES: 2,
            LULL_DOCK_FROM_SECONDS: 0,
            LULL_DOCK_UNTIL_SECONDS: 30,
            LULL_DOCK_CLEAR_METERS: 3_000,
        });
        const above = captain();
        above(dradis(), [salvoAway(4)]);
        expect(Array.from({ length: 10 }, () => above(dradis()))).not.toContain('dock_for_repair');
        const near = captain();
        expect(near(dradis(2_000), [salvoAway(1)])).not.toBe('dock_for_repair');
        expect(near(dradis(4_000))).toBe('dock_for_repair');
        const late = captain();
        for (let i = 0; i < 6; i++) late(dradis(2_000), [salvoAway(1)]);
        expect(Array.from({ length: 10 }, () => late(dradis()))).not.toContain('dock_for_repair');
    });

    it('holds the dock for LULL_DOCK_HOLD_SECONDS, and casts off early once an enemy nears a station', () => {
        setReferenceKnobs({
            LULL_DOCK_MISSILES: 2,
            LULL_DOCK_FROM_SECONDS: 0,
            LULL_DOCK_HOLD_SECONDS: 50,
            LULL_DOCK_CLEAR_METERS: 3_000,
        });
        const say = captain();
        expect(say(dradis(), [salvoAway(1)])).toBe('dock_for_repair'); // t=5
        const after = Array.from({ length: 12 }, () => say(dradis()));
        expect(after.indexOf('undock')).toBe(9); // t=55
        const broken = captain();
        broken(dradis(), [salvoAway(1)]);
        expect(broken(dradis(9_000))).not.toBe('undock');
        expect(broken(dradis(2_000))).toBe('undock');
    });
});
