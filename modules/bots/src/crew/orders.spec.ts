import { DOCKING_MODE, DOCK_DWELL_SECONDS, crewOrders, orderFromCallout, ordersBoard, ordersLines } from './orders';

import { Display } from '../brain/controls';
import { verbalReader } from '../brain/verbal';

const helms = (mode: number, x = 0, healthy = 16): Display => ({
    panels: { 'docking-status': { mode }, 'armor-status': { numberOfPlates: 16, healthyPlates: healthy } },
    radar: { ownShip: { position: { x, y: 0 } } },
});

describe('crew order state', () => {
    it('keeps one order per slot: a new order replaces only its own slot', () => {
        const orders = crewOrders(['helms', 'weapons']);
        orders.give({ kind: 'close_to', params: { target: { name: 'raider' }, range: 2000 } }, 'captain', 1);
        orders.give({ kind: 'preserve_energy' }, 'captain', 2);
        orders.give({ kind: 'hold_here' }, 'captain', 3);
        const { slots } = orders.state;
        expect(slots.maneuver?.kind).toBe('hold_here');
        expect(slots.energy).toMatchObject({
            kind: 'preserve_energy',
            issuer: 'captain',
            issuedAt: 2,
            binds: ['helms', 'weapons'],
        });
    });

    it('revokes one slot and reranks slots on the captain`s order', () => {
        const orders = crewOrders();
        orders.give({ kind: 'preserve_energy' }, 'captain', 1);
        orders.give({ kind: 'hold_here' }, 'captain', 1);
        orders.give({ kind: 'revoke', params: { slot: 'energy' } }, 'captain', 2);
        orders.give({ kind: 'prioritize', params: { ranking: ['maneuver', 'energy'] } }, 'captain', 3);
        expect(orders.state.slots.energy).toBeUndefined();
        expect(orders.state.slots.maneuver?.kind).toBe('hold_here');
        expect(orders.state.priorities.slice(0, 3)).toEqual(['maneuver', 'energy', 'repair']);
        expect(orders.state.prioritizedBy).toEqual({ issuer: 'captain', issuedAt: 3 });
    });

    it('runs dock for repair through its steps to completion from what helms shows', () => {
        const orders = crewOrders();
        orders.give(
            {
                kind: 'dock_for_repair',
                params: { station: { name: 'dock', position: { x: 5000, y: 0 }, radius: 1200 } },
            },
            'captain',
            0,
        );
        orders.advance({ station: 'helms', display: helms(DOCKING_MODE.UNDOCKED), seconds: 1 });
        expect(orders.state.slots.navigation).toMatchObject({ step: 'en_route', note: 'en route, 3.8 km' });
        orders.advance({ station: 'helms', display: helms(DOCKING_MODE.DOCKING, 3700), seconds: 10 });
        orders.advance({ station: 'helms', display: helms(DOCKING_MODE.DOCKED, 3780), seconds: 20 });
        expect(orders.state.slots.navigation).toMatchObject({ step: 'docked', stepAt: 20, status: 'active' });
        orders.advance({
            station: 'helms',
            display: helms(DOCKING_MODE.DOCKED, 3780),
            seconds: 20 + DOCK_DWELL_SECONDS,
        });
        expect(orders.state.slots.navigation?.status).toBe('complete');
    });

    it('fires a standing dock order once armor falls below its share, once', () => {
        const orders = crewOrders();
        orders.give({ kind: 'dock_below_armor', params: { station: { name: 'dock' }, threshold: 0.5 } }, 'captain', 0);
        orders.advance({ station: 'helms', display: helms(DOCKING_MODE.UNDOCKED, 0, 9), seconds: 5 });
        expect(orders.state.slots.navigation).toBeUndefined();
        orders.advance({ station: 'helms', display: helms(DOCKING_MODE.UNDOCKED, 0, 7), seconds: 6 });
        expect(orders.state.slots.navigation).toMatchObject({
            kind: 'dock_for_repair',
            issuer: 'dock_below_armor standing order',
        });
        expect(orders.state.slots.repair?.kind).toBe('dock_below_armor');
    });

    it('reads out every slot in priority order, and the ranking', () => {
        const orders = crewOrders(['engineer']);
        orders.give(
            orderFromCallout('dock_for_repair', { name: 'dock', distance: '4.0', bearing: '000' }, { x: 0, y: 0 }),
            'captain',
            0,
        );
        orders.give(orderFromCallout('preserve_energy', undefined, undefined), 'captain', 2);
        orders.advance({ station: 'helms', display: helms(DOCKING_MODE.UNDOCKED, 0), seconds: 10 });
        expect(ordersLines(ordersBoard(orders.state, 12))).toEqual([
            'Standing orders: navigation: dock at dock for armor repairs (en route, 4.0 km), from the captain 12 s ago; energy: preserve energy, from the captain 10 s ago.',
            'Priorities: repair > navigation > engagement > energy > maneuver > stance > sensors.',
        ]);
    });

    it('reaches a verbal brain as plain lines', () => {
        const orders = crewOrders();
        orders.give({ kind: 'hold_position' }, 'captain', 0);
        const lines = verbalReader(1)({ panels: { orders: ordersBoard(orders.state, 3) } });
        expect(lines).toContain('Standing orders: navigation: hold position, from the captain 3 s ago.');
    });

    it('push_on revokes the navigation order', () => {
        const orders = crewOrders();
        orders.give({ kind: 'hold_position' }, 'captain', 0);
        orders.give(orderFromCallout('push_on', undefined, undefined), 'captain', 1);
        expect(orders.state.slots.navigation).toBeUndefined();
    });
});
