import { Capabilities, Display, stationControls } from './controls';
import { GivenOrder, ORDERS_PANEL, captainOrdersFromBoard, orderFromCallout } from '../crew/orders';

import { BrainRequest } from './request';
import { Policy } from './brain';
import { referenceCallout } from './reference-orders';
import { testBoard } from '../crew/orders.fixtures';
import { withOrderBoard } from './order-executors';

const weaponsCapabilities: Capabilities = {
    commands: [
        { command: 'fireTube', count: 1 },
        { command: 'tubeSafety', count: 1 },
    ],
};

/** Weapons always wants to launch from tube 0. */
const triggerHappy: Policy = {
    name: 'trigger-happy',
    answer: (_r, controls) =>
        Promise.resolve({
            answers: Object.fromEntries(
                controls.map((c) => [
                    c.id,
                    {
                        choice: c.command === 'fireTube' ? 'fire' : c.command === 'tubeSafety' ? 'off' : c.rest,
                        source: 'rule' as const,
                    },
                ]),
            ),
        }),
};

/** Weapons locked on a raider `distance` out, under a board holding `orders` at board time `at`. */
function weaponsDisplay(orders: GivenOrder[], at: number, distance = 6_000): Display {
    const board = testBoard().tick(at).give(orders).shown;
    return {
        panels: {
            'targeting-status': { targetId: 'raider' },
            'tubes-status': [
                { index: 0, loadedProjectile: 'HiExpMissile', loading: 1, safetyLocked: true, bearing: 0 },
            ],
            [ORDERS_PANEL]: { ...board, orders: board.orders.map((o) => ({ ...o, issuedAt: 0, secondsAgo: at })) },
        },
        radar: {
            ownShip: { heading: 0, position: { x: 0, y: 0 }, faction: 1 },
            contacts: [
                {
                    id: 'raider',
                    name: 'raider',
                    type: 'Spaceship',
                    faction: 2,
                    distance,
                    bearing: 0,
                    position: { x: distance, y: 0 },
                },
            ],
        },
    };
}

describe('salvo order', () => {
    it('lets weapons launch until the count flies, holds the tubes, and launches again once one is due', async () => {
        const policy = withOrderBoard(triggerHappy, 'weapons');
        const salvo = [{ kind: 'salvo', params: { count: 2 } }];
        const launch = async (at: number) => {
            const shown = weaponsDisplay(salvo, at);
            const controls = stationControls({ display: shown, capabilities: weaponsCapabilities, burstSeconds: 0.5 });
            const { answers } = await policy.answer({} as BrainRequest, controls, shown);
            return [answers['fireTube:0']?.choice, answers['tubeSafety:0']?.choice];
        };
        // 6 km at 600 m/s plus 5 s slack: each missile counts for 15 s
        expect(await launch(1)).toEqual(['fire', 'off']);
        expect(await launch(2)).toEqual(['fire', 'off']);
        expect(await launch(3)).toEqual(['hold_fire', 'on']);
        expect(await launch(15)).toEqual(['hold_fire', 'on']);
        expect(await launch(17)).toEqual(['fire', 'off']);
    });

    it('is given by the captain callout and read back for the reference seats', () => {
        expect(orderFromCallout('salvo', { count: '2' }, undefined)).toEqual({ kind: 'salvo', params: { count: 2 } });
        const board = testBoard().give([{ kind: 'salvo', params: { count: 3 } }]).shown;
        expect(captainOrdersFromBoard({ panels: { [ORDERS_PANEL]: board } }).salvo).toBe(3);
    });

    it('the reference captain orders a salvo once it engaged, and not again while one stands', () => {
        const request = {
            state: {},
            questions: {
                callout: {
                    type: 'choice',
                    instructions: '',
                    criteria: { salvo: '', close_to: '', engage: '', silence: '' },
                },
            },
        } as BrainRequest;
        const shown: Display = {
            panels: {},
            radar: {
                ownShip: { heading: 0, position: { x: 0, y: 0 }, faction: 1 },
                contacts: [
                    {
                        id: 'r',
                        name: 'raider',
                        type: 'Spaceship',
                        faction: 2,
                        distance: 30_000,
                        bearing: 0,
                        position: { x: 30_000, y: 0 },
                    },
                ],
            },
        };
        expect(referenceCallout(request, shown, shown, 5)?.choice).toBe('engage');
        expect(referenceCallout(request, shown, shown, 5, 'raider')?.choice).toBe('salvo');
        expect(referenceCallout(request, shown, shown, 5, 'raider', { salvoOrdered: true })?.choice).toBe('close_to');
    });
});
