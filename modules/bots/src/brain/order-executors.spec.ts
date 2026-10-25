import { Capabilities, Display, stationControls } from './controls';
import { DOCKING_MODE, GivenOrder, ORDERS_PANEL } from '../crew/orders';

import { BrainRequest } from './request';
import { Policy } from './brain';
import { idleTestPolicy } from './order-executors.fixtures';
import { testBoard } from '../crew/orders.fixtures';
import { withOrderBoard } from './order-executors';

const helmsCapabilities: Capabilities = {
    commands: [
        'rotation',
        'strafe',
        'boost',
        'antiDrift',
        'rotationMode',
        'maneuveringMode',
        'afterBurner',
        'dock',
        'launch',
    ].map((command) => ({ command })),
};

type Seen = { name: string; distance: number; bearing: number; radius: number };

/** A board holding `orders`, given in order. */
function board(orders: GivenOrder[]) {
    return testBoard().give(orders).shown;
}

/** Helms of a ship at the origin facing 0°, under `orders`. */
function helmsDisplay(
    orders: ReturnType<typeof board>,
    contacts: Seen[] = [],
    {
        rotationMode = 1,
        dockingMode: mode = DOCKING_MODE.UNDOCKED,
        boost = 0,
    }: { rotationMode?: number; dockingMode?: number; boost?: number } = {},
): Display {
    return {
        panels: {
            'helms-stats': {
                rotationMode,
                maneuveringMode: 1,
                maneuveringCommand: { x: boost, y: 0 },
                antiDrift: 0,
                afterBurner: 0,
            },
            'docking-status': { mode },
            [ORDERS_PANEL]: orders,
        },
        radar: {
            ownShip: { heading: 0, position: { x: 0, y: 0 } },
            contacts: contacts.map((c) => ({
                type: 'Spaceship',
                position: {
                    x: c.distance * Math.cos((c.bearing * Math.PI) / 180),
                    y: c.distance * Math.sin((c.bearing * Math.PI) / 180),
                },
                ...c,
            })),
        },
    };
}

async function choices(policy: Policy, shown: Display, capabilities = helmsCapabilities) {
    const controls = stationControls({ display: shown, capabilities, burstSeconds: 1 });
    const { answers } = await policy.answer({} as BrainRequest, controls, shown);
    return Object.fromEntries(Object.entries(answers).map(([id, a]) => [id, a.choice]));
}

const station = { name: 'dock', position: { x: 0, y: 4000 }, radius: 1200 };
const dock: GivenOrder = { kind: 'dock_for_repair', params: { station } };
const chase: GivenOrder = {
    kind: 'chase_target',
    params: { target: { name: 'raider', position: { x: 20_000, y: 0 } } },
};

describe('reference seats under the order board', () => {
    it('play their own policy while no order binds them', async () => {
        const c = await choices(withOrderBoard(idleTestPolicy, 'helms'), helmsDisplay(board([{ kind: 'hold_here' }])));
        expect(c.rotation).toBe('hold');
        expect(c.dock).toBe('wait');
    });

    it('dock for repair: helms leaves the target lock and turns toward the station', async () => {
        const policy = withOrderBoard(idleTestPolicy, 'helms');
        expect((await choices(policy, helmsDisplay(board([dock]), [], { rotationMode: 2 }))).rotationMode).toBe(
            'press',
        );
        const c = await choices(policy, helmsDisplay(board([dock])));
        expect(c.rotation).toBe('right');
        expect(c.dock).toBe('wait');
    });

    it('dock for repair: helms presses dock within reach, then leaves the ship to the autopilot', async () => {
        const policy = withOrderBoard(idleTestPolicy, 'helms');
        const near: Seen = { name: 'dock', distance: 1_900, bearing: 90, radius: 1_200 };
        expect((await choices(policy, helmsDisplay(board([dock]), [near]))).dock).toBe('press');
        const docking = await choices(
            policy,
            helmsDisplay(board([dock]), [near], { dockingMode: DOCKING_MODE.DOCKING }),
        );
        expect(docking.dock).toBe('wait');
        expect(docking.antiDrift).toBe('release');
    });

    it('stays docked once the dock order is complete, and casts off only on the order to undock', async () => {
        const policy = withOrderBoard(idleTestPolicy, 'helms');
        const docked = { dockingMode: DOCKING_MODE.DOCKED };
        expect((await choices(policy, helmsDisplay(board([]), [], docked))).dock).toBe('wait');
        const state = testBoard().give([dock]);
        state.report({ station: 'helms', display: helmsDisplay(board([]), [], docked) });
        expect(state.shown.orders[0]?.status).toBe('complete');
        expect((await choices(policy, helmsDisplay(state.shown, [], docked))).dock).toBe('wait');
        expect((await choices(policy, helmsDisplay(board([{ kind: 'undock' }]), [], docked))).dock).toBe('press');
    });

    it('launches only from the dock, on the order to launch', async () => {
        const policy = withOrderBoard(idleTestPolicy, 'helms');
        const docked = { dockingMode: DOCKING_MODE.DOCKED };
        const launching = await choices(policy, helmsDisplay(board([{ kind: 'launch' }]), [], docked));
        expect(launching.launch).toBe('press');
        expect(launching.dock).toBe('wait');
        const flying = await choices(
            policy,
            helmsDisplay(board([{ kind: 'launch' }]), [], { dockingMode: DOCKING_MODE.UNDOCKED }),
        );
        expect(flying.launch).toBe('wait');
    });

    it('chase target vs preserve energy: the stance`s ranking decides the afterburner, the chase still steers', async () => {
        const policy = withOrderBoard(idleTestPolicy, 'helms');
        const energyFirst = await choices(policy, helmsDisplay(board([chase, { kind: 'preserve_energy' }])));
        expect(energyFirst.afterBurner).toBe('release');
        expect(energyFirst.boost).toBe('forward');
        const chaseFirst = await choices(
            policy,
            helmsDisplay(board([chase, { kind: 'preserve_energy' }, { kind: 'chase' }]), [], { boost: 0.8 }),
        );
        expect(chaseFirst.afterBurner).toBe('engage');
        expect(chaseFirst.boost).toBe('forward');
    });

    it('an engagement turns the nose onto its target', async () => {
        const raider: Seen = { name: 'raider', distance: 3_000, bearing: 90, radius: 20 };
        const c = await choices(
            withOrderBoard(idleTestPolicy, 'helms'),
            helmsDisplay(board([{ kind: 'engage', params: { target: { name: 'raider' } } }]), [raider]),
        );
        expect(c.rotation).toBe('right');
    });

    it('preserve energy caps thrust where no higher order wants it', async () => {
        const c = await choices(
            withOrderBoard(idleTestPolicy, 'helms'),
            helmsDisplay(board([{ kind: 'preserve_energy' }]), [], { boost: 0.8 }),
        );
        expect(c.boost).toBe('back');
    });

    it('dock for repair: the engineer queues docked-tier repairs for lost armor once docked', async () => {
        const state = testBoard().give([dock]);
        state.report({ station: 'helms', display: helmsDisplay(board([]), [], { dockingMode: DOCKING_MODE.DOCKED }) });
        const shown: Display = {
            panels: {
                [ORDERS_PANEL]: state.shown,
                'armor-status': { numberOfPlates: 16, healthyPlates: 12 },
                'damage-report': [],
                'repair-queue': {
                    slots: [
                        { protocolId: 'armorPlateRenewal', priority: 'OFF', refusalReason: '' },
                        { protocolId: 'hullWideSystemsOverhaul', priority: 'OFF', refusalReason: '' },
                    ],
                },
            },
        };
        const c = await choices(withOrderBoard(idleTestPolicy, 'engineer'), shown, {
            commands: [{ command: 'cycleRepairPriority' }],
        });
        expect(c['cycleRepairPriority:armorPlateRenewal']).toBe('raise');
        expect(c['cycleRepairPriority:hullWideSystemsOverhaul']).toBe('none');
    });
});
