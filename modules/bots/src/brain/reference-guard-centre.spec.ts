import { CALLOUT_QUESTION, calloutSaid } from './callout';

import { BrainRequest } from './request';
import { Display } from './controls';
import { brainSpecSchema } from './spec';
import captain from '../brains/captain.v1.json';
import { orderFromCallout } from '../crew/orders';
import { referenceSeat } from '../reference-crew';

const contact = (name: string, x: number, y: number, faction: number, radius: number) => ({
    id: name,
    name,
    type: 'Spaceship',
    scanLevel: 'BASIC',
    faction,
    radius,
    position: { x, y },
    distance: Math.hypot(x, y),
    bearing: (Math.atan2(y, x) * 180) / Math.PI,
});
const station = (name: string, x: number, y: number) => contact(name, x, y, 1, 1200);
const raider = (name: string, x: number, y: number) => contact(name, x, y, 2, 20);

/** Three stations whose centre lies 40 km east of the GVTS (at the origin). */
function dradis(extra: ReturnType<typeof contact>[] = [], own = { x: 0, y: 0 }): Display {
    const at = (c: ReturnType<typeof contact>) => {
        const dx = c.position.x - own.x;
        const dy = c.position.y - own.y;
        return { ...c, distance: Math.hypot(dx, dy), bearing: (Math.atan2(dy, dx) * 180) / Math.PI };
    };
    return {
        panels: {},
        radar: {
            ownShip: { id: 'GVTS', heading: 0, faction: 1, position: own },
            contacts: [
                station('large', 40_000, 30_000),
                station('platform', 70_000, -15_000),
                station('small', 10_000, -15_000),
                ...extra,
            ].map(at),
        },
    };
}

const request = {
    questions: { [CALLOUT_QUESTION]: { criteria: { close_to: '', guard_station: '', hold_here: '', silence: '' } } },
} as unknown as BrainRequest;

const guardCallout = {
    guard_station: { say: 'guard the stations from {distance} km at bearing {bearing}', fill: 'guardOrder', when: '' },
};

function captainSeat(guardCentre: boolean) {
    return referenceSeat(
        brainSpecSchema.parse({
            ...captain,
            callouts: { ...captain.callouts, ...guardCallout },
            ...(guardCentre ? { guardCentre } : {}),
        }),
    );
}

async function said(seat: ReturnType<typeof captainSeat>, shown: Display) {
    const { answers } = await seat.policy.answer(request, [], shown, []);
    const answer = answers[CALLOUT_QUESTION];
    return {
        choice: answer.choice,
        said: calloutSaid(seat.spec, answer.choice, shown, CALLOUT_QUESTION, undefined, answer.values),
    };
}

describe('reference captain guards the stations between waves', () => {
    it('without it, holds where it is while no enemy is in sight', async () => {
        expect((await said(captainSeat(false), dradis())).choice).toBe('hold_here');
    });

    it('with no enemy in sight, orders helms to the centre of the allied stations', async () => {
        const { choice, said: words } = await said(captainSeat(true), dradis());
        expect(choice).toBe('guard_station');
        const order = orderFromCallout(choice, words?.values, { x: 0, y: 0 });
        expect(order?.kind).toBe('close_to');
        const target = (order?.params as { target: { position: { x: number; y: number } } }).target;
        expect(target.position.x).toBeCloseTo(40_000, -2);
        expect(target.position.y).toBeCloseTo(0, -2);
    });

    it('steers past a station that lies on the way to the centre', async () => {
        // north of `large`, which sits between the ship and the centre
        const own = { x: 40_100, y: 45_000 };
        const { choice, said: words } = await said(captainSeat(true), dradis([], own));
        const order = orderFromCallout(choice, words?.values, own);
        const { x, y } = (order?.params as { target: { position: { x: number; y: number } } }).target.position;
        const t = Math.max(
            0,
            Math.min(
                1,
                ((40_000 - own.x) * (x - own.x) + (30_000 - own.y) * (y - own.y)) /
                    ((x - own.x) ** 2 + (y - own.y) ** 2),
            ),
        );
        const miss = Math.hypot(own.x + t * (x - own.x) - 40_000, own.y + t * (y - own.y) - 30_000);
        expect(miss).toBeGreaterThan(2_500);
    });

    it('holds once at the centre', async () => {
        expect((await said(captainSeat(true), dradis([], { x: 39_000, y: 500 }))).choice).toBe('hold_here');
    });

    it('closes on an enemy in sight instead', async () => {
        expect((await said(captainSeat(true), dradis([raider('r', 0, 90_000)]))).choice).toBe('close_to');
    });

    it('is no option of a brain that does not opt in', () => {
        expect(captainSeat(false).spec.guardCentre).toBeUndefined();
    });
});
