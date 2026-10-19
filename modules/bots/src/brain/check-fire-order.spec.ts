import { Capabilities, Display, stationControls } from './controls';
import { GivenOrder, ORDERS_PANEL, captainOrdersFromBoard, orderFromCallout } from '../crew/orders';

import { BrainRequest } from './request';
import { CALLOUT_QUESTION } from './callout';
import { Heard } from './callout';
import { Policy } from './brain';
import { referenceCallout } from './reference-orders';
import { testBoard } from '../crew/orders.fixtures';
import { withOrderBoard } from './order-executors';

const weaponsCapabilities: Capabilities = {
    commands: [
        { command: 'fireTube', count: 1 },
        { command: 'tubeSafety', count: 1 },
        { command: 'fireChainGun', count: 1 },
    ],
};

/** Weapons always wants to fire gun and tube 0. */
const triggerHappy: Policy = {
    name: 'trigger-happy',
    answer: (_r, controls) =>
        Promise.resolve({
            answers: Object.fromEntries(
                controls.map((c) => [
                    c.id,
                    {
                        choice:
                            c.command === 'tubeSafety'
                                ? 'off'
                                : c.command === 'fireTube' || c.command === 'fireChainGun'
                                  ? 'fire'
                                  : c.rest,
                        source: 'rule' as const,
                    },
                ]),
            ),
        }),
};

const ally = { id: 'station', name: 'station', distance: 7000 };

/** Weapons locked on a raider, under a board holding `orders`, with the targeting panel's check-fire line. */
function weaponsDisplay(orders: GivenOrder[], allyInLine?: typeof ally): Display {
    const board = testBoard().tick(1).give(orders).shown;
    return {
        panels: {
            'targeting-status': { targetId: 'raider', allyInLine: allyInLine ?? null, allyNearTarget: null },
            'tubes-status': [
                { index: 0, loadedProjectile: 'HiExpMissile', loading: 1, safetyLocked: true, bearing: 0 },
            ],
            [ORDERS_PANEL]: board,
        },
        radar: {
            ownShip: { heading: 0, position: { x: 0, y: 0 }, faction: 1 },
            contacts: [
                {
                    id: 'raider',
                    name: 'raider',
                    type: 'Spaceship',
                    faction: 2,
                    distance: 3000,
                    bearing: 0,
                    position: { x: 3000, y: 0 },
                },
            ],
        },
    };
}

async function fire(orders: GivenOrder[], allyInLine?: typeof ally) {
    const policy = withOrderBoard(triggerHappy, 'weapons');
    const shown = weaponsDisplay(orders, allyInLine);
    const controls = stationControls({ display: shown, capabilities: weaponsCapabilities, burstSeconds: 0.5 });
    const { answers } = await policy.answer({} as BrainRequest, controls, shown);
    return [answers['fireChainGun:0']?.choice, answers['fireTube:0']?.choice, answers['tubeSafety:0']?.choice];
}

describe('check fire order', () => {
    const checkFire: GivenOrder = { kind: 'check_fire' };
    const engage: GivenOrder = { kind: 'engage', params: { target: { name: 'raider' } } };

    it('holds gun and tubes while the line of fire shows an ally, and fires once the line is clear', async () => {
        expect(await fire([engage, checkFire], ally)).toEqual(['hold_fire', 'hold_fire', 'on']);
        expect(await fire([engage, checkFire])).toEqual(['fire', 'fire', 'off']);
    });

    it('leaves weapons to its policy when no check fire stands', async () => {
        expect(await fire([engage], ally)).toEqual(['fire', 'fire', 'off']);
    });

    it('with a target, holds only for that ally', async () => {
        const named: GivenOrder = { kind: 'check_fire', params: { target: { name: 'other' } } };
        expect(await fire([named], ally)).toEqual(['fire', 'fire', 'off']);
        expect(await fire([{ kind: 'check_fire', params: { target: { name: 'station' } } }], ally)).toEqual([
            'hold_fire',
            'hold_fire',
            'on',
        ]);
    });

    it('is given and revoked by captain callouts, and read back for the reference captain', () => {
        expect(orderFromCallout('call_check_fire', {}, undefined)).toEqual({ kind: 'check_fire' });
        expect(orderFromCallout('clear_to_fire', {}, undefined)).toEqual({
            kind: 'revoke',
            params: { slot: 'fire_control' },
        });
        const board = testBoard().give([checkFire]).shown;
        expect(captainOrdersFromBoard({ panels: { [ORDERS_PANEL]: board } }).checkFire).toBe(true);
        expect(captainOrdersFromBoard({ panels: {} }).checkFire).toBeUndefined();
    });

    describe('reference captain', () => {
        const request = {
            state: {},
            questions: {
                [CALLOUT_QUESTION]: {
                    type: 'choice',
                    instructions: '',
                    criteria: { call_check_fire: '', clear_to_fire: '', engage: '', silence: '' },
                },
            },
        } as BrainRequest;
        const shown: Display = { panels: {}, radar: { ownShip: { heading: 0, position: { x: 0, y: 0 }, faction: 1 } } };
        const said = (callout: string, secondsAgo: number): Heard => ({
            speaker: 'weapons',
            callout,
            phrase: callout,
            secondsAgo,
        });
        const call = (heard: Heard[], checkFireOrdered: boolean) =>
            referenceCallout(request, shown, shown, 5, undefined, { heard, checkFireOrdered })?.choice;

        it('orders check fire when weapons calls it, and not again while it stands', () => {
            expect(call([said('check_fire', 1)], false)).toBe('call_check_fire');
            expect(call([said('check_fire', 1)], true)).toBe('silence');
        });

        it('revokes check fire when weapons calls the line clear', () => {
            expect(call([said('check_fire', 8), said('line_clear', 2)], true)).toBe('clear_to_fire');
            expect(call([said('check_fire', 8), said('line_clear', 2)], false)).toBe('silence');
            expect(call([said('line_clear', 8), said('check_fire', 2)], true)).toBe('silence');
        });
    });
});
