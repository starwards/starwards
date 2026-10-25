import { calloutMemory, referenceCallout } from './reference-orders';
import { BrainRequest } from './request';
import { CALLOUT_QUESTION } from './callout';
import { Display } from './controls';
import { orderFromCallout } from '../crew/orders';
import { setReferenceKnobs } from './reference-knobs';

const request = {
    state: {},
    questions: { [CALLOUT_QUESTION]: { type: 'choice', instructions: '', criteria: { launch: '', undock: '' } } },
} as unknown as BrainRequest;

/** An allied station at the origin and, when `gap` is given, an enemy that far from it. */
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
        distance: 2_000,
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

const say = (shown: Display) =>
    referenceCallout(request, shown, undefined, 5, undefined, { state: calloutMemory(), dockOrdered: true })?.choice;

describe('launch on threat (LAUNCH_ON_THREAT_METERS)', () => {
    afterEach(() => setReferenceKnobs());

    it('never launches by default: a docked captain with an enemy near casts off', () => {
        expect(say(dradis(1_000))).toBe('undock');
    });

    it('launches when docked and an enemy is within the knob of a station', () => {
        setReferenceKnobs({ LAUNCH_ON_THREAT_METERS: 5_000 });
        expect(say(dradis(1_000))).toBe('launch');
    });

    it('casts off gently when docked and calm, or the enemy is beyond the knob', () => {
        setReferenceKnobs({ LAUNCH_ON_THREAT_METERS: 5_000 });
        expect(say(dradis())).toBe('undock');
        expect(say(dradis(9_000))).toBe('undock');
    });

    it('turns the launch callout into the launch crew order', () => {
        expect(orderFromCallout('launch', undefined, undefined)).toEqual({ kind: 'launch' });
    });
});
