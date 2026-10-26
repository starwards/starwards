import { DOCTRINE_DOCK_TIMEOUT, crewDoctrine } from './doctrine';
import { DOCKING_MODE } from './orders';
import { Display } from '../brain/controls';
import { testBoard } from './orders.fixtures';

const signalsDisplay: Display = {
    panels: {},
    radar: { ownShip: { position: { x: 0, y: 0 }, heading: 90, faction: 1 } },
};
const enemyPosition = {
    callout: 'enemy_position',
    values: { name: 'raider', range: '10.0', bearing: '90° left of the nose', trend: 'closing' },
};
const helms = (healthy: number, dock = true, mode: number = DOCKING_MODE.UNDOCKED): Display => ({
    panels: { 'armor-status': { numberOfPlates: 10, healthyPlates: healthy }, 'docking-status': { mode } },
    radar: {
        ownShip: { position: { x: 0, y: 0 }, heading: 0, faction: 1 },
        contacts: dock
            ? [
                  {
                      name: 'GVTS',
                      type: 'Spaceship',
                      faction: 1,
                      radius: 400,
                      distance: 3000,
                      position: { x: 3000, y: 0 },
                  },
              ]
            : [],
    },
});

function crew() {
    const b = testBoard();
    const doctrine = crewDoctrine();
    const run = () => {
        for (const c of doctrine.commands(b.shown)) b.send(c);
        b.tick();
    };
    const slot = (s: string) => b.shown.orders.find((o) => o.slot === s);
    return { b, doctrine, run, slot };
}

describe('crew doctrine', () => {
    it('closes on the enemy signals reports, at its world position', () => {
        const { doctrine, run, slot } = crew();
        doctrine.hear('signals', enemyPosition, signalsDisplay);
        run();
        const o = slot('maneuver')!;
        expect(o).toMatchObject({ kind: 'close_to', issuer: 'doctrine', origin: 'signals' });
        expect(o.params.target?.name).toBe('raider');
        expect(o.params.target?.position?.x).toBeCloseTo(10_000);
        expect(o.params.target?.position?.y).toBeCloseTo(0);
        expect(o.params.range).toBe(2000);
    });

    it('engages once weapons says it holds a lock', () => {
        const { doctrine, run, slot } = crew();
        doctrine.hear('weapons', { callout: 'target_locked' }, signalsDisplay);
        run();
        expect(slot('engagement')).toMatchObject({ kind: 'engage', issuer: 'doctrine', origin: 'weapons' });
    });

    it('stands a dock order once a dock is in sight, and casts off once repaired', () => {
        const { b, doctrine, run, slot } = crew();
        doctrine.see('helms', helms(10));
        run();
        expect(slot('repair')).toMatchObject({ kind: 'dock_below_armor', issuer: 'doctrine' });
        b.report({ station: 'helms', display: helms(4) });
        expect(slot('navigation')).toMatchObject({ kind: 'dock_for_repair', issuer: 'doctrine' });
        b.report({ station: 'helms', display: helms(4, true, DOCKING_MODE.DOCKED) });
        doctrine.see('helms', helms(9, true, DOCKING_MODE.DOCKED));
        run();
        expect(slot('navigation')?.kind).toBe('dock_for_repair');
        doctrine.see('helms', helms(10, true, DOCKING_MODE.DOCKED));
        run();
        expect(slot('navigation')).toMatchObject({ kind: 'undock', issuer: 'doctrine' });
    });

    it('never overwrites a captain order; a captain revoke hands the slot back to doctrine', () => {
        const { b, doctrine, run, slot } = crew();
        b.give([{ kind: 'hold_here' }]);
        doctrine.hear('signals', enemyPosition, signalsDisplay);
        run();
        expect(slot('maneuver')).toMatchObject({ kind: 'hold_here', issuer: 'captain' });
        b.give([{ kind: 'revoke', params: { slot: 'maneuver' } }]);
        run();
        expect(slot('maneuver')).toMatchObject({ kind: 'close_to', issuer: 'doctrine' });
        b.give([{ kind: 'hold_here' }]);
        expect(slot('maneuver')).toMatchObject({ kind: 'hold_here', issuer: 'captain' });
    });

    it('stays out of a slot a captain order contradicts', () => {
        const { b, doctrine, run, slot } = crew();
        b.give([{ kind: 'hold_fire' }]);
        doctrine.hear('weapons', { callout: 'target_locked' }, signalsDisplay);
        expect(doctrine.commands(b.shown)).toEqual([]);
        run();
        expect(slot('engagement')?.kind).toBe('hold_fire');
    });

    describe('casts off a dock it sent the ship to before armor is back', () => {
        const dockedAt0 = () => {
            const c = crew();
            c.doctrine.see('helms', helms(10));
            c.run();
            c.b.report({ station: 'helms', display: helms(0) });
            c.b.report({ station: 'helms', display: helms(0, true, DOCKING_MODE.DOCKED) });
            c.doctrine.see('helms', helms(0, true, DOCKING_MODE.DOCKED));
            c.run();
            expect(c.slot('navigation')?.kind).toBe('dock_for_repair');
            return c;
        };
        const enemy = (distance: number) => ({
            name: 'raider',
            type: 'Spaceship',
            faction: 2,
            distance,
            position: { x: distance, y: 0 },
        });
        const withContacts = (d: Display, extra: object[]): Display => ({
            ...d,
            radar: {
                ...(d.radar as object),
                contacts: [...((d.radar as { contacts?: object[] }).contacts ?? []), ...extra],
            },
        });

        it('launches when an enemy is in range', () => {
            const { doctrine, run, slot } = dockedAt0();
            doctrine.see('helms', withContacts(helms(0, true, DOCKING_MODE.DOCKED), [enemy(5000)]));
            run();
            expect(slot('navigation')).toMatchObject({ kind: 'launch', issuer: 'doctrine' });
        });

        it('undocks when an allied hull is no longer intact', () => {
            const { doctrine, run, slot } = dockedAt0();
            doctrine.see('helms', helms(0, true, DOCKING_MODE.DOCKED));
            doctrine.see('signals', {
                panels: { 'hull-status': [{ id: 'S2', name: 'S2', allied: true, intel: 'LIVE', hull: 'damaged' }] },
            });
            run();
            expect(slot('navigation')).toMatchObject({ kind: 'launch', issuer: 'doctrine' });
        });

        it('undocks after the dock timeout', () => {
            const { b, doctrine, run, slot } = dockedAt0();
            b.tick(DOCTRINE_DOCK_TIMEOUT + 10);
            doctrine.see('helms', helms(0, true, DOCKING_MODE.DOCKED));
            run();
            expect(slot('navigation')).toMatchObject({ kind: 'undock', issuer: 'doctrine' });
        });
    });
});
