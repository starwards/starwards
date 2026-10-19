import { ORDERS_PANEL, captainOrdersFromBoard, focusTarget, orderFromCallout } from '../crew/orders';

import { BrainRequest } from './request';
import { BrainSpec } from './spec';
import { Display } from './controls';
import { calloutSaid } from './callout';
import { referenceCallout } from './reference-orders';
import { testBoard } from '../crew/orders.fixtures';

type Ship = { id: string; x: number; faction?: number; radius?: number };

/** Own ship (faction 1) at the origin; ships on the x axis at `x`. */
function picture(ships: Ship[]): Display {
    return {
        panels: {},
        radar: {
            ownShip: { heading: 0, position: { x: 0, y: 0 }, faction: 1 },
            contacts: ships.map((s) => ({
                id: s.id,
                name: s.id,
                type: 'Spaceship',
                faction: s.faction ?? 2,
                radius: s.radius ?? 11,
                distance: Math.abs(s.x),
                bearing: s.x < 0 ? 180 : 0,
                position: { x: s.x, y: 0 },
            })),
        },
    };
}

describe('focus order', () => {
    it('points at the first listed enemy in sight, and moves on once it is gone', () => {
        const params = { targets: [{ name: 'b' }, { name: 'a' }] };
        expect(
            focusTarget(
                params,
                picture([
                    { id: 'a', x: 10_000 },
                    { id: 'b', x: 30_000 },
                ]),
            )?.name,
        ).toBe('b');
        expect(focusTarget(params, picture([{ id: 'a', x: 10_000 }]))?.name).toBe('a');
        expect(focusTarget(params, picture([{ id: 'c', x: 10_000 }]))).toBeUndefined();
    });

    it('picks the enemy nearest the station, or the one closing fastest', () => {
        const now = picture([
            { id: 'base', x: -20_000, faction: 1, radius: 1200 },
            { id: 'a', x: 10_000 },
            { id: 'b', x: -30_000 },
        ]);
        expect(focusTarget({ pick: 'nearest_to', station: { name: 'base' } }, now)?.name).toBe('b');
        const before = picture([
            { id: 'a', x: 11_000 },
            { id: 'b', x: -33_000 },
        ]);
        expect(focusTarget({ pick: 'fastest_closing' }, now, before)?.name).toBe('b');
        expect(focusTarget({ pick: 'fastest_closing' }, now)?.name).toBe('a');
    });

    it('is what the reference seats engage while it stands', () => {
        const shown = picture([
            { id: 'a', x: 10_000 },
            { id: 'b', x: 30_000 },
        ]);
        shown.panels[ORDERS_PANEL] = testBoard().give([
            { kind: 'focus', params: { targets: [{ name: 'b' }, { name: 'a' }] } },
        ]).shown;
        expect(captainOrdersFromBoard(shown)).toMatchObject({ engage: 'b', focus: true });
    });

    it('the reference captain calls a focus with two enemies in sight, nearest the threatened station first', () => {
        const request = {
            state: {},
            questions: {
                callout: { type: 'choice', instructions: '', criteria: { focus: '', engage: '', silence: '' } },
            },
        } as BrainRequest;
        const two = picture([
            { id: 'base', x: -20_000, faction: 1, radius: 1200 },
            { id: 'a', x: 10_000 },
            { id: 'b', x: -30_000 },
        ]);
        expect(referenceCallout(request, two, two, 5)?.choice).toBe('focus');
        expect(referenceCallout(request, two, two, 5, 'b', { focusOrdered: true })?.choice).toBe('silence');
        const one = picture([{ id: 'a', x: 10_000 }]);
        expect(referenceCallout(request, one, one, 5)?.choice).toBe('engage');

        const spec = {
            decisionSeconds: 5,
            callouts: { focus: { say: 'focus {focus}', when: '', fill: 'focusOrder' } },
        } as unknown as BrainSpec;
        const said = calloutSaid(spec, 'focus', two);
        expect(said?.phrase).toBe('focus the enemy nearest base (b, a)');
        expect(orderFromCallout('focus', said?.values, undefined)).toEqual({
            kind: 'focus',
            params: { pick: 'nearest_to', station: { name: 'base' } },
        });
        const listed = calloutSaid(
            spec,
            'focus',
            picture([
                { id: 'a', x: 1 },
                { id: 'b', x: 2 },
            ]),
        );
        expect(orderFromCallout('focus', listed?.values, undefined)).toEqual({
            kind: 'focus',
            params: { targets: [{ name: 'a' }, { name: 'b' }] },
        });
    });
});
