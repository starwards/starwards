import { DOCKING_MODE } from './orders';
import { Display } from '../brain/controls';
import { crewDoctrine } from './doctrine';
import { setReferenceKnobs } from '../brain/reference-knobs';
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

    describe('dock exit knobs', () => {
        afterEach(() => setReferenceKnobs());
        const dockedAt = (healthy: number) => {
            const c = crew();
            c.doctrine.see('helms', helms(10));
            c.run();
            c.b.report({ station: 'helms', display: helms(healthy) });
            c.b.report({ station: 'helms', display: helms(healthy, true, DOCKING_MODE.DOCKED) });
            c.doctrine.see('helms', helms(healthy, true, DOCKING_MODE.DOCKED));
            c.run();
            expect(c.slot('navigation')?.kind).toBe('dock_for_repair');
            return c;
        };
        const enemy = (distance: number, faction = 2) => ({
            name: 'raider',
            type: 'Spaceship',
            faction,
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
        const allyRow = (hull: string, intel = 'LIVE') => ({
            panels: { 'hull-status': [{ id: 'S2', name: 'S2', allied: true, intel, hull }] },
        });
        const nearEnemy = (healthy: number) => withContacts(helms(healthy, true, DOCKING_MODE.DOCKED), [enemy(5000)]);

        it('with every knob at its default, only armor casts off', () => {
            const { b, doctrine, run, slot } = dockedAt(0);
            doctrine.see('helms', nearEnemy(0));
            doctrine.see('signals', allyRow('critical'));
            b.tick(10_000);
            run();
            expect(slot('navigation')?.kind).toBe('dock_for_repair');
        });

        describe('DOCK_EXIT_THREAT_METERS', () => {
            it('casts off when a hostile is within range', () => {
                setReferenceKnobs({ DOCK_EXIT_THREAT_METERS: 8000 });
                const { doctrine, run, slot } = dockedAt(0);
                doctrine.see('helms', nearEnemy(0));
                run();
                expect(slot('navigation')).toMatchObject({ kind: 'undock', issuer: 'doctrine' });
            });
            it('stays for a hostile beyond range, a neutral and an ally', () => {
                setReferenceKnobs({ DOCK_EXIT_THREAT_METERS: 8000 });
                const { doctrine, run, slot } = dockedAt(0);
                doctrine.see(
                    'helms',
                    withContacts(helms(0, true, DOCKING_MODE.DOCKED), [enemy(9000), enemy(2000, -1), enemy(2000, 1)]),
                );
                run();
                expect(slot('navigation')?.kind).toBe('dock_for_repair');
            });
            it('forgets the threat once commands() ran', () => {
                setReferenceKnobs({ DOCK_EXIT_THREAT_METERS: 8000 });
                const { doctrine, b, run, slot } = dockedAt(0);
                doctrine.see('helms', nearEnemy(0));
                expect(doctrine.commands(b.shown)).toHaveLength(1);
                expect(doctrine.commands(b.shown)).toEqual([]);
                run();
                expect(slot('navigation')?.kind).toBe('dock_for_repair');
            });
        });

        describe('DOCK_EXIT_ALLY_DAMAGED', () => {
            it('casts off while an allied hull is hurt', () => {
                setReferenceKnobs({ DOCK_EXIT_ALLY_DAMAGED: 1 });
                const { doctrine, run, slot } = dockedAt(0);
                doctrine.see('signals', allyRow('damaged'));
                run();
                expect(slot('navigation')?.kind).toBe('undock');
            });
            it('stays for an intact or snapshot ally row', () => {
                setReferenceKnobs({ DOCK_EXIT_ALLY_DAMAGED: 1 });
                const { doctrine, run, slot } = dockedAt(0);
                doctrine.see('signals', allyRow('intact'));
                doctrine.see('signals', allyRow('critical', 'SNAPSHOT'));
                run();
                expect(slot('navigation')?.kind).toBe('dock_for_repair');
            });
        });

        describe('DOCK_EXIT_TIMEOUT_SECONDS', () => {
            it('casts off that long after docking', () => {
                setReferenceKnobs({ DOCK_EXIT_TIMEOUT_SECONDS: 120 });
                const { b, doctrine, run, slot } = dockedAt(0);
                b.tick(200);
                doctrine.see('helms', helms(0, true, DOCKING_MODE.DOCKED));
                run();
                expect(slot('navigation')?.kind).toBe('undock');
            });
            it('stays before the timeout', () => {
                setReferenceKnobs({ DOCK_EXIT_TIMEOUT_SECONDS: 120 });
                const { b, doctrine, run, slot } = dockedAt(0);
                b.tick(100);
                doctrine.see('helms', helms(0, true, DOCKING_MODE.DOCKED));
                run();
                expect(slot('navigation')?.kind).toBe('dock_for_repair');
            });
        });

        describe('DOCK_EXIT_ARMOR_FLOOR', () => {
            it('shuts the threat exit below the floor', () => {
                setReferenceKnobs({ DOCK_EXIT_THREAT_METERS: 8000, DOCK_EXIT_ARMOR_FLOOR: 0.3 });
                const { doctrine, run, slot } = dockedAt(2);
                doctrine.see('helms', nearEnemy(2));
                run();
                expect(slot('navigation')?.kind).toBe('dock_for_repair');
            });
            it('opens the threat exit at the floor', () => {
                setReferenceKnobs({ DOCK_EXIT_THREAT_METERS: 8000, DOCK_EXIT_ARMOR_FLOOR: 0.3 });
                const { doctrine, run, slot } = dockedAt(4);
                doctrine.see('helms', nearEnemy(4));
                run();
                expect(slot('navigation')?.kind).toBe('undock');
            });
        });

        describe('DOCK_EXIT_LAUNCH', () => {
            it('casts off with launch', () => {
                setReferenceKnobs({ DOCK_EXIT_THREAT_METERS: 8000, DOCK_EXIT_LAUNCH: 1 });
                const { doctrine, run, slot } = dockedAt(0);
                doctrine.see('helms', nearEnemy(0));
                run();
                expect(slot('navigation')).toMatchObject({ kind: 'launch', issuer: 'doctrine' });
            });
        });

        describe('DOCK_EXIT_HOLDOFF_SECONDS', () => {
            it('stands no new dock order until the hold-off passes, so there is no dock-launch-redock loop', () => {
                setReferenceKnobs({ DOCK_EXIT_THREAT_METERS: 8000, DOCK_EXIT_HOLDOFF_SECONDS: 60 });
                const { b, doctrine, run, slot } = dockedAt(0);
                doctrine.see('helms', nearEnemy(0));
                run();
                expect(slot('navigation')?.kind).toBe('undock');
                expect(slot('repair')).toBeUndefined();
                doctrine.see('helms', helms(0));
                run();
                expect(slot('repair')).toBeUndefined();
                b.tick(100);
                run();
                doctrine.see('helms', helms(0));
                run();
                expect(slot('repair')).toMatchObject({ kind: 'dock_below_armor', issuer: 'doctrine' });
            });
            it('leaves the standing dock order alone at the default', () => {
                setReferenceKnobs({ DOCK_EXIT_THREAT_METERS: 8000 });
                const { doctrine, run, slot } = dockedAt(0);
                doctrine.see('helms', nearEnemy(0));
                run();
                expect(slot('repair')).toMatchObject({ kind: 'dock_below_armor' });
            });
        });

        it('a captain navigation order blocks the cast-off', () => {
            setReferenceKnobs({ DOCK_EXIT_THREAT_METERS: 8000 });
            const { b, doctrine, run, slot } = dockedAt(0);
            b.give([{ kind: 'launch' }]);
            expect(slot('navigation')).toMatchObject({ issuer: 'captain' });
            doctrine.see('helms', nearEnemy(0));
            run();
            expect(slot('navigation')).toMatchObject({ kind: 'launch', issuer: 'captain' });
        });
    });
});
