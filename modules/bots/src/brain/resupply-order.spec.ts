import { calloutMemory, referenceCallout } from './reference-orders';

import { BrainRequest } from './request';
import { CALLOUT_QUESTION } from './callout';
import { Display } from './controls';

const request = (...options: string[]) =>
    ({
        state: {},
        questions: {
            [CALLOUT_QUESTION]: {
                type: 'choice',
                instructions: '',
                criteria: Object.fromEntries([...options, 'silence'].map((o) => [o, ''])),
            },
        },
    }) as BrainRequest;

type Ship = { id: string; x: number; faction?: number; radius?: number };

/** Own ship (faction 1) at the origin; ships on the x axis at `x`; the ammo panel with `shells` of 100 shells left. */
function picture(ships: Ship[], shells = 100): Display {
    return {
        panels: { 'ammo-status': { fitted: true, ammo: { HiExpShell: { count: shells, max: 100 } } } },
        radar: {
            ownShip: { heading: 0, position: { x: 0, y: 0 }, faction: 1 },
            contacts: ships.map((s) => ({
                id: s.id,
                name: s.id,
                type: 'Spaceship',
                faction: s.faction ?? 2,
                radius: s.radius ?? 11,
                distance: Math.abs(s.x),
                bearing: 0,
                position: { x: s.x, y: 0 },
            })),
        },
    };
}

const station = { id: 'base', x: 5000, faction: 1, radius: 1200 };
const heard = (callout: string) => [{ speaker: 'weapons', callout, phrase: callout, secondsAgo: 1 }];

describe('weapons shell stock callouts', () => {
    it('says shells low once as the share falls under 40%, and restocked once it is back over 80%', () => {
        const state = calloutMemory();
        const said = (shells: number) =>
            referenceCallout(
                request('shells_low', 'shells_restocked'),
                picture([], shells),
                undefined,
                0.5,
                undefined,
                {
                    state,
                },
            )?.choice;
        expect([said(60), said(39), said(30), said(70), said(85), said(90)]).toEqual([
            'silence',
            'shells_low',
            'silence',
            'silence',
            'shells_restocked',
            'silence',
        ]);
    });
});

describe('weapons shell stock callouts after damage', () => {
    it('counts a magazine full to its shrunken capacity as low', () => {
        const state = calloutMemory();
        const said = (shells: number, max: number) => {
            const d = picture([]);
            d.panels['ammo-status'] = { fitted: true, ammo: { HiExpShell: { count: shells, max } } };
            return referenceCallout(request('shells_low', 'shells_restocked'), d, undefined, 0.5, undefined, { state })
                ?.choice;
        };
        expect([said(100, 100), said(14, 14), said(14, 100), said(90, 100)]).toEqual([
            'silence',
            'shells_low',
            'silence',
            'shells_restocked',
        ]);
    });
});

describe('captain docking to restock', () => {
    const options = request('undock', 'dock_for_repair', 'hold_here');

    it('docks at a near station once weapons called the shells low and no enemy is near', () => {
        const state = calloutMemory();
        const said = (ships: Ship[], h: ReturnType<typeof heard> = [], dockOrdered = false) =>
            referenceCallout(options, picture(ships), undefined, 5, undefined, { state, heard: h, dockOrdered })
                ?.choice;
        expect(said([station])).toBe('hold_here');
        expect(said([station], heard('shells_low'))).toBe('dock_for_repair');
        expect(said([station, { id: 'raider', x: 150_000 }])).toBe('dock_for_repair');
        expect(said([station, { id: 'raider', x: 50_000 }])).toBe('silence');
    });

    it('does not dock at a station that is far off', () => {
        const state = calloutMemory();
        expect(
            referenceCallout(options, picture([{ ...station, x: 60_000 }]), undefined, 5, undefined, {
                state,
                heard: heard('shells_low'),
            })?.choice,
        ).toBe('hold_here');
    });

    it('casts off once weapons called the shells restocked, or an enemy comes near', () => {
        const state = calloutMemory();
        const said = (ships: Ship[], h: ReturnType<typeof heard> = []) =>
            referenceCallout(options, picture(ships), undefined, 5, undefined, { state, heard: h, dockOrdered: true })
                ?.choice;
        expect(said([station], heard('shells_low'))).toBe('hold_here');
        expect(said([station, { id: 'raider', x: 60_000 }])).toBe('undock');
        expect(said([station], heard('shells_restocked'))).toBe('undock');
    });
});
