import { calloutMemory, referenceCallout } from './reference-orders';
import { BrainRequest } from './request';
import { CALLOUT_QUESTION, magazineCapacity } from './callout';
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

const station = { id: 's', name: 's', type: 'Spaceship', faction: 1, radius: 1_200, distance: 4_000, bearing: 0 };

function dradis(enemyDistance?: number, docked = false): Display {
    const enemy = { id: 'r', name: 'r', type: 'Spaceship', faction: 2, distance: enemyDistance, bearing: 90 };
    return {
        panels: docked ? { orders: undefined } : {},
        radar: {
            ownShip: { id: 'GVTS', heading: 0, faction: 1, position: { x: 0, y: 0 } },
            contacts: enemyDistance === undefined ? [station] : [station, enemy],
        },
    };
}

describe('restock window (RESTOCK_FROM_SECONDS)', () => {
    afterEach(() => setReferenceKnobs());

    it('docks once when the window opens with no enemy near, and casts off when it closes', () => {
        setReferenceKnobs({ RESTOCK_FROM_SECONDS: 10, RESTOCK_UNTIL_SECONDS: 30 });
        const state = calloutMemory();
        const say = (shown: Display, dockOrdered: boolean) =>
            referenceCallout(request, shown, undefined, 5, undefined, { state, dockOrdered })?.choice;
        expect(say(dradis(), false)).toBe('hold_here'); // t=5, window shut
        expect(say(dradis(), false)).toBe('dock_for_repair'); // t=10
        expect(say(dradis(), true)).toBe('hold_here'); // t=15, docked, window open
        expect(say(dradis(), true)).toBe('hold_here'); // t=20
        expect(say(dradis(), true)).toBe('hold_here'); // t=25
        expect(say(dradis(), true)).toBe('undock'); // t=30, window shut
        expect(say(dradis(), false)).toBe('hold_here'); // never again
    });

    it('does not dock while an enemy is within the clearance, and is off by default', () => {
        setReferenceKnobs({ RESTOCK_FROM_SECONDS: 5, RESTOCK_UNTIL_SECONDS: 30, RESTOCK_CLEAR_METERS: 30_000 });
        const state = calloutMemory();
        expect(referenceCallout(request, dradis(20_000), undefined, 5, undefined, { state })?.choice).not.toBe(
            'dock_for_repair',
        );
        setReferenceKnobs();
        const fresh = calloutMemory();
        for (let i = 0; i < 10; i++) {
            expect(referenceCallout(request, dradis(), undefined, 5, undefined, { state: fresh })?.choice).not.toBe(
                'dock_for_repair',
            );
        }
    });

    it('with RESTOCK_BELOW_CAPACITY, docks only after the engineer called the magazine below it', () => {
        setReferenceKnobs({ RESTOCK_FROM_SECONDS: 5, RESTOCK_UNTIL_SECONDS: 60, RESTOCK_BELOW_CAPACITY: 0.5 });
        const state = calloutMemory();
        const heard = (capacity: string) => [
            { speaker: 'engineer', callout: 'magazine_state', phrase: '', secondsAgo: 1, values: { capacity } },
        ];
        const say = (h: object[]) =>
            referenceCallout(request, dradis(), undefined, 5, undefined, { state, heard: h as never })?.choice;
        expect(say([])).not.toBe('dock_for_repair');
        expect(say(heard('0.80'))).not.toBe('dock_for_repair');
        expect(say([])).not.toBe('dock_for_repair');
        expect(say(heard('0.14'))).toBe('dock_for_repair');
    });
});

describe('magazineState fill', () => {
    it('reads the capacity off the damage report, 1 without a defect', () => {
        expect(magazineCapacity({ 'damage-report': [{ system: '/magazine', field: 'capacity', value: 0.14 }] })).toBe(
            0.14,
        );
        expect(magazineCapacity({ 'damage-report': [] })).toBe(1);
    });

    it('the engineer calls the magazine state when it changes by a tenth, and every 30 s', () => {
        const engineer = {
            state: {},
            questions: { [CALLOUT_QUESTION]: { type: 'choice', instructions: '', criteria: { magazine_state: '' } } },
        } as unknown as BrainRequest;
        const state = calloutMemory();
        const report = (value: number) => ({
            panels: { 'damage-report': [{ system: '/magazine', field: 'capacity', value }] },
        });
        const say = (value: number) =>
            referenceCallout(engineer, report(value) as Display, undefined, 5, undefined, { state })?.choice;
        expect(say(0.9)).toBe('magazine_state');
        expect(say(0.85)).toBe('silence');
        expect(say(0.7)).toBe('magazine_state');
        for (let i = 0; i < 5; i++) say(0.7);
        expect(say(0.7)).toBe('magazine_state');
    });
});
