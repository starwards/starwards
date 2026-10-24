import { CALLOUT_QUESTION, calloutSaid } from './callout';

import { BrainRequest } from './request';
import { Display } from './controls';
import { brainSpecSchema } from './spec';
import captain from '../brains/captain.v1.json';
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

/** Two stations 60 km apart, 100 km off the GVTS: a straggler hugs `platform`, `attackers` close on `small`. */
function dradis(attackers: ReturnType<typeof raider>[], straggler = raider('straggler', 101_500, 0)): Display {
    return {
        panels: {},
        radar: {
            ownShip: { id: 'GVTS', heading: 0, faction: 1, position: { x: 0, y: 0 } },
            contacts: [station('platform', 100_000, 0), station('small', 100_000, 60_000), straggler, ...attackers],
        },
    };
}

const request = {
    questions: { [CALLOUT_QUESTION]: { criteria: { close_to: '', silence: '' } } },
} as unknown as BrainRequest;

function captainSeat(threatTarget: boolean) {
    return referenceSeat(brainSpecSchema.parse({ ...captain, ...(threatTarget ? { threatTarget } : {}) }));
}

async function closeTo(seat: ReturnType<typeof captainSeat>, shown: Display) {
    const { answers } = await seat.policy.answer(request, [], shown, []);
    const answer = answers[CALLOUT_QUESTION];
    expect(answer.choice).toBe('close_to');
    return calloutSaid(seat.spec, answer.choice, shown, CALLOUT_QUESTION, undefined, answer.values)?.values?.name;
}

const twoAttackers = [raider('a1', 100_000, 63_000), raider('a2', 101_000, 62_500)];

describe('reference captain threat-weighted target', () => {
    it('without it, closes on the enemy nearest any station: the straggler', async () => {
        expect(await closeTo(captainSeat(false), dradis(twoAttackers))).toBe('straggler');
    });

    it('closes on the attackers of the station most enemies close on, past a straggler nearer its own', async () => {
        expect(await closeTo(captainSeat(true), dradis(twoAttackers))).toBe('a2');
    });

    it('keeps its station while the count only ties, and its target while another is not much nearer', async () => {
        const seat = captainSeat(true);
        expect(await closeTo(seat, dradis(twoAttackers))).toBe('a2');
        // a2 drifts 1 km off; a1 is now the nearer, but not by the margin
        expect(await closeTo(seat, dradis([raider('a1', 100_000, 63_000), raider('a2', 101_500, 63_300)]))).toBe('a2');
        // one attacker left: one enemy at each station, and the captain stays on small
        expect(await closeTo(seat, dradis([raider('a1', 100_000, 63_000)]))).toBe('a1');
    });

    it('moves to another station once more enemies close on it', async () => {
        const seat = captainSeat(true);
        expect(await closeTo(seat, dradis([raider('a1', 100_000, 63_000)], raider('straggler', 140_000, 0)))).toBe(
            'a1',
        );
        const raid = [raider('a1', 100_000, 63_000), raider('p1', 102_000, 0), raider('p2', 98_000, 1_000)];
        expect(await closeTo(seat, dradis(raid, raider('straggler', 140_000, 0)))).toBe('p1');
    });

    it('is no option of a brain that does not opt in', () => {
        expect(captainSeat(false).spec.threatTarget).toBeUndefined();
    });
});
