import { DOCKING_MODE, orderFromCallout, ordersLines } from './orders';

import { Display } from '../brain/controls';
import { testBoard } from './orders.fixtures';
import { verbalReader } from '../brain/verbal';

const helms = (mode: number, x = 0, healthy = 16): Display => ({
    panels: { 'docking-status': { mode }, 'armor-status': { numberOfPlates: 16, healthyPlates: healthy } },
    radar: { ownShip: { position: { x, y: 0 } } },
});
const slot = (b: ReturnType<typeof testBoard>, s: string) => b.shown.orders.find((o) => o.slot === s);

describe('crew order board as seats read it', () => {
    it('keeps one order per slot, binding the energy-drawing seats to preserve energy', () => {
        const b = testBoard(['helms', 'weapons']);
        b.give([{ kind: 'close_to', params: { target: { name: 'raider' }, range: 2000 } }]);
        b.tick(2).give([{ kind: 'preserve_energy' }]);
        b.tick(3).give([{ kind: 'hold_here' }]);
        expect(slot(b, 'maneuver')?.kind).toBe('hold_here');
        expect(slot(b, 'energy')).toMatchObject({
            kind: 'preserve_energy',
            issuer: 'captain',
            issuedAt: 2,
            binds: ['helms', 'weapons'],
        });
    });

    it('revokes one slot; a stance sets the slot ranking', () => {
        const b = testBoard();
        b.give([
            { kind: 'preserve_energy' },
            { kind: 'hold_here' },
            { kind: 'revoke', params: { slot: 'energy' } },
            { kind: 'chase' },
        ]);
        expect(slot(b, 'energy')).toBeUndefined();
        expect(b.shown.priorities.slice(0, 3)).toEqual(['maneuver', 'engagement', 'repair']);
        b.give([{ kind: 'revoke', params: { slot: 'stance' } }]);
        expect(b.shown.priorities[0]).toBe('repair');
    });

    it('aborts an engagement whose target weapons no longer sees, and says why', () => {
        const b = testBoard().give([{ kind: 'engage', params: { target: { name: 'raider' } } }]);
        b.report({ station: 'weapons', display: { panels: {}, radar: { contacts: [] } } });
        expect(slot(b, 'engagement')).toMatchObject({ status: 'aborted', note: 'target lost or destroyed' });
    });

    it('completes dock for repair once docked; casting off is its own order', () => {
        const b = testBoard().give([
            {
                kind: 'dock_for_repair',
                params: { station: { name: 'dock', position: { x: 5000, y: 0 }, radius: 1200 } },
            },
        ]);
        b.report({ station: 'helms', display: helms(DOCKING_MODE.UNDOCKED) });
        expect(slot(b, 'navigation')).toMatchObject({ step: 'en_route', note: 'en route, 3.8 km' });
        b.tick(10).report({ station: 'helms', display: helms(DOCKING_MODE.DOCKING, 3700) });
        b.tick(20).report({ station: 'helms', display: helms(DOCKING_MODE.DOCKED, 3780) });
        expect(slot(b, 'navigation')).toMatchObject({ step: 'docked', stepAt: 20, status: 'complete' });
        b.tick(80).give([orderFromCallout('undock', undefined, undefined)]);
        b.tick(90).report({ station: 'helms', display: helms(DOCKING_MODE.UNDOCKED, 3780) });
        expect(slot(b, 'navigation')).toMatchObject({ kind: 'undock', status: 'complete' });
    });

    it('fires a standing dock order once armor falls below its share, once, under its own issuer', () => {
        const b = testBoard().give(
            [{ kind: 'dock_below_armor', params: { station: { name: 'dock' }, threshold: 0.5 } }],
            'doctrine',
            'helms',
        );
        b.report({ station: 'helms', display: helms(DOCKING_MODE.UNDOCKED, 0, 9) });
        expect(slot(b, 'navigation')).toBeUndefined();
        b.report({ station: 'helms', display: helms(DOCKING_MODE.UNDOCKED, 0, 7) });
        expect(slot(b, 'navigation')).toMatchObject({
            kind: 'dock_for_repair',
            issuer: 'doctrine',
            origin: 'dock_below_armor standing order',
        });
        expect(slot(b, 'repair')).toMatchObject({ kind: 'dock_below_armor', fired: true });
        b.give([{ kind: 'revoke', params: { slot: 'navigation' } }]);
        b.report({ station: 'helms', display: helms(DOCKING_MODE.UNDOCKED, 0, 7) });
        expect(slot(b, 'navigation')).toBeUndefined();
    });

    it('a standing dock order takes navigation from an order its slot outranks, and not from one that outranks it', () => {
        const patrol = { kind: 'patrol', params: { region: { name: 'veil', position: { x: 0, y: 9000 } } } };
        const dock = { kind: 'dock_below_armor', params: { station: { name: 'dock' } } };
        const b = testBoard().give([patrol, dock]);
        b.report({ station: 'helms', display: helms(DOCKING_MODE.UNDOCKED, 0, 7) });
        expect(slot(b, 'navigation')?.kind).toBe('dock_for_repair');
        const offensive = testBoard().give([{ kind: 'offensive' }, patrol, dock]);
        offensive.report({ station: 'helms', display: helms(DOCKING_MODE.UNDOCKED, 0, 7) });
        expect(slot(offensive, 'navigation')?.kind).toBe('patrol');
    });

    it('reads out every slot in priority order with who gave it, and the ranking', () => {
        const b = testBoard(['engineer']);
        b.give([
            orderFromCallout('dock_for_repair', { name: 'dock', distance: '4.0', bearing: '000' }, { x: 0, y: 0 }),
        ]);
        b.tick(2).give(
            [{ kind: 'close_to', params: { target: { name: 'raider' }, range: 2000 } }],
            'doctrine',
            'signals',
        );
        b.tick(10).report({ station: 'helms', display: helms(DOCKING_MODE.UNDOCKED, 0) });
        b.tick(12);
        expect(ordersLines(b.shown)).toEqual([
            'Standing orders: navigation: dock at dock for armor repairs (en route, 4.0 km), from the captain 12 s ago; maneuver: close to 2.0 km of raider, from doctrine, from signals 10 s ago.',
            'Priorities: repair > navigation > engagement > energy > maneuver > stance > sensors.',
        ]);
    });

    it('reaches a verbal brain as plain lines', () => {
        const b = testBoard().give([{ kind: 'hold_position' }]);
        b.tick(4);
        const lines = verbalReader(1)({ panels: { orders: b.shown } });
        expect(lines).toContain('Standing orders: navigation: hold position, from the captain 4 s ago.');
    });

    it('push_on revokes the navigation order', () => {
        const b = testBoard().give([{ kind: 'hold_position' }]);
        b.give([orderFromCallout('push_on', undefined, undefined)]);
        expect(slot(b, 'navigation')).toBeUndefined();
    });
});
