import { Answer, Policy } from './brain';
import { DOCKING_MODE, RETREAT_RUN_METERS, ShownOrder, ordersBinding, readOrders } from '../crew/orders';

import { Control } from './controls';

type XY = { x: number; y: number };
type Contact = {
    name?: string;
    distance: number;
    bearing: number;
    position?: XY;
    radius?: number;
    type?: string;
    scanLevel?: string;
};
type Radar = { ownShip?: { heading?: number; position?: XY }; contacts?: Contact[] };
type Display = { panels: Record<string, unknown>; radar?: Radar };
type Helms = {
    rotationMode?: number;
    maneuveringMode?: number;
    rotationCommand?: number;
    maneuveringCommand?: Partial<XY>;
};
type RepairSlot = { protocolId: string; priority: string };
type SystemStatus = { pointer: string; power: number };

/** What an executor sees at one decision: the seat's display, its controls, and what its own policy would do. */
type Context = {
    display: Display;
    controls: readonly Control[];
    base: Record<string, Answer>;
    memory: Map<string, unknown>;
};

/**
 * How one seat carries out one order kind: the commands whose controls it may decide (`constrains`)
 * and, at each decision, its choice for some of them. Where two orders in force propose different
 * choices for one control, the order in the higher-ranked slot decides it; every other control of the
 * lower order still goes its way. The trade-off is therefore per control and readable from `constrains`.
 */
type OrderExecutor = {
    constrains: readonly string[];
    propose(order: ShownOrder, ctx: Context): Partial<Record<string, string>>;
};

/** Surface distance at which helms presses dock (the gravitas clamp reaches 1 km). */
const DOCK_PRESS_METERS = 800;
/** Where helms parks to press dock: this far off the station's surface. */
const APPROACH_METERS = 500;
const ASSUMED_STATION_RADIUS = 1_200;
/** A patrol keeps this far outside the body it hides behind, and sweeps this far either side. */
const PATROL_STANDOFF_METERS = 1_500;
const PATROL_SWEEP_METERS = 2_000;
/** Chase hands over to the seat's own parking rules inside this range of a target it sees. */
const CHASE_HANDOVER_METERS = 1_500;
/** Preserve energy: the chain gun fires only inside this range, and thrust stays under this share. */
const THRIFTY_FIRE_METERS = 3_000;
const THRIFTY_THRUST = 0.5;
const THRIFTY_POWER = 0.5;
const VELOCITY = 1;
/** The largest rotation key setting an executor turns at. */
const TURN_RATE = 0.4;
const MAX_SPEED = 450;
const ORDERED_SPEED = 0.9 * MAX_SPEED;
const GAIN = 0.3;
const PURSUIT_METERS = 1_500;
const DOCKED_REPAIRS = ['armorPlateRenewal', 'hullWideSystemsOverhaul'] as const;
const HELM = ['rotationMode', 'maneuveringMode', 'rotation', 'boost', 'strafe', 'afterBurner', 'antiDrift'] as const;

const own = (d: Display) => d.radar?.ownShip?.position ?? { x: 0, y: 0 };
const heading = (d: Display) => d.radar?.ownShip?.heading ?? 0;
const docking = (d: Display) => (d.panels['docking-status'] as { mode?: number } | undefined)?.mode;
const seen = (d: Display, name: string | undefined) =>
    name === undefined ? undefined : d.radar?.contacts?.find((c) => c.name === name);

/** Helm choices that fly the ship to `spot` (world) and stop there; `still` holds it where it is. */
function flyHelm(display: Display, spot: XY | undefined, { afterburner = true, antiDrift = false } = {}) {
    const helms = display.panels['helms-stats'] as Helms | undefined;
    if (!helms) return {};
    const at = own(display);
    const choice: Record<string, string> = {
        rotationMode: helms.rotationMode !== VELOCITY ? 'press' : 'wait',
        maneuveringMode: helms.maneuveringMode !== VELOCITY ? 'press' : 'wait',
    };
    const off = spot ? delta(bearingTo(at, spot), heading(display)) : 0;
    // the rotation key sets a turn rate: ease it toward a rate proportional to the bearing error, or the ship spins past
    const turn = Number(helms.rotationCommand ?? 0);
    const goal = spot ? Math.max(-TURN_RATE, Math.min(TURN_RATE, (off / 60) * TURN_RATE)) : 0;
    choice.rotation = !spot ? 'centre' : turn < goal - 0.025 ? 'right' : turn > goal + 0.025 ? 'left' : 'hold';
    const wanted = spot ? flyTo(at, spot, heading(display)) : { x: 0, y: 0 };
    for (const [command, axis, up, down] of [
        ['boost', 'x', 'forward', 'back'],
        ['strafe', 'y', 'right', 'left'],
    ] as const) {
        const current = Number(helms.maneuveringCommand?.[axis] ?? 0);
        choice[command] = current < wanted[axis] - 0.025 ? up : current > wanted[axis] + 0.025 ? down : 'hold';
    }
    choice.afterBurner =
        afterburner && spot && length(sub(spot, at)) > PURSUIT_METERS && Math.abs(off) < 15 ? 'engage' : 'release';
    choice.antiDrift = antiDrift || !spot || length(sub(spot, at)) < 150 ? 'engage' : 'release';
    return choice;
}

function dockSpot(display: Display, order: ShownOrder) {
    const station = order.params.station;
    const contact = seen(display, station?.name);
    const center = contact?.position ?? station?.position;
    if (!center) return undefined;
    const radius = contact?.radius ?? station?.radius ?? ASSUMED_STATION_RADIUS;
    const out = sub(own(display), center);
    return {
        spot: add(center, scale(out, (radius + APPROACH_METERS) / Math.max(length(out), 1))),
        surface: length(out) - radius,
    };
}

const helmsExecutors: Record<string, OrderExecutor> = {
    dock_for_repair: {
        constrains: [...HELM, 'dock'],
        propose(order, { display }) {
            const mode = docking(display);
            // docking or docked, the autopilot and the clamp hold the ship
            if (mode === DOCKING_MODE.DOCKING || mode === DOCKING_MODE.DOCKED) {
                return { dock: 'wait', antiDrift: 'release', afterBurner: 'release', rotation: 'centre' };
            }
            const target = dockSpot(display, order);
            if (!target) return {};
            return {
                ...flyHelm(display, target.spot),
                dock: mode === DOCKING_MODE.UNDOCKED && target.surface <= DOCK_PRESS_METERS ? 'press' : 'wait',
            };
        },
    },
    retreat: {
        constrains: HELM,
        propose(order, { display }) {
            const from = order.params.target?.position;
            if (!from) return {};
            const away = sub(own(display), from);
            return flyHelm(display, add(from, scale(away, RETREAT_RUN_METERS / Math.max(length(away), 1))));
        },
    },
    hold_position: { constrains: HELM, propose: (_o, { display }) => flyHelm(display, undefined, { antiDrift: true }) },
    patrol: {
        constrains: HELM,
        propose(order, { display, memory }) {
            const region = order.params.region;
            if (!region?.position) return {};
            const from = region.from ?? own(display);
            const back = sub(region.position, from);
            const unit = scale(back, 1 / Math.max(length(back), 1));
            const behind = add(region.position, scale(unit, (region.radius ?? 0) + PATROL_STANDOFF_METERS));
            const across = { x: -unit.y, y: unit.x };
            const leg = (memory.get('patrolLeg') as number | undefined) ?? 1;
            const spot = add(behind, scale(across, leg * PATROL_SWEEP_METERS));
            if (length(sub(spot, own(display))) < 300) memory.set('patrolLeg', -leg);
            return flyHelm(display, spot);
        },
    },
    chase_target: {
        constrains: HELM,
        propose(order, { display }) {
            const contact = seen(display, order.params.target?.name);
            if (contact && contact.distance < CHASE_HANDOVER_METERS) return {};
            const spot = contact?.position ?? order.params.target?.position;
            return spot ? flyHelm(display, spot) : {};
        },
    },
    preserve_energy: {
        constrains: ['afterBurner', 'boost', 'strafe', 'warpUp'],
        propose(_order, { display, base }) {
            const helms = display.panels['helms-stats'] as Helms | undefined;
            const choice: Record<string, string> = { afterBurner: 'release', warpUp: 'wait' };
            for (const [command, axis, up, down] of [
                ['boost', 'x', 'forward', 'back'],
                ['strafe', 'y', 'right', 'left'],
            ] as const) {
                const current = Number(helms?.maneuveringCommand?.[axis] ?? 0);
                if (current > THRIFTY_THRUST) choice[command] = down;
                else if (current < -THRIFTY_THRUST) choice[command] = up;
                else if (
                    (base[command]?.choice === up && current >= THRIFTY_THRUST - 0.05) ||
                    (base[command]?.choice === down && current <= -THRIFTY_THRUST + 0.05)
                )
                    choice[command] = 'hold';
            }
            return choice;
        },
    },
};

const weaponsExecutors: Record<string, OrderExecutor> = {
    chase_target: {
        constrains: ['target'],
        propose(order, { display }) {
            const locked = (display.panels['targeting-status'] as { targetId?: string } | undefined)?.targetId;
            const lock = display.radar?.contacts?.find((c) => (c as { id?: string }).id === locked);
            const wanted = order.params.target?.name;
            return wanted && seen(display, wanted) && lock?.name !== wanted ? { target: 'next' } : {};
        },
    },
    preserve_energy: {
        constrains: ['fireChainGun'],
        propose(_order, { display, controls }) {
            const locked = (display.panels['targeting-status'] as { targetId?: string } | undefined)?.targetId;
            const lock = display.radar?.contacts?.find((c) => (c as { id?: string }).id === locked);
            return lock && lock.distance <= THRIFTY_FIRE_METERS
                ? {}
                : Object.fromEntries(
                      controls.filter((c) => c.command === 'fireChainGun').map((c) => [c.id, 'hold_fire']),
                  );
        },
    },
};

const engineerExecutors: Record<string, OrderExecutor> = {
    dock_for_repair: {
        constrains: ['cycleRepairPriority'],
        propose(order, { display }) {
            if (order.step !== 'docked') return {};
            const slots = (display.panels['repair-queue'] as { slots?: RepairSlot[] } | undefined)?.slots ?? [];
            const armor = display.panels['armor-status'] as
                { numberOfPlates?: number; healthyPlates?: number } | undefined;
            const needs: Record<string, boolean> = {
                armorPlateRenewal: armor !== undefined && (armor.healthyPlates ?? 0) < (armor.numberOfPlates ?? 0),
                hullWideSystemsOverhaul: ((display.panels['damage-report'] ?? []) as unknown[]).length > 0,
            };
            return Object.fromEntries(
                DOCKED_REPAIRS.map((key) => {
                    const slot = slots.find((s) => s.protocolId === key);
                    return [`cycleRepairPriority:${key}`, slot?.priority === 'OFF' && needs[key] ? 'raise' : 'none'];
                }),
            );
        },
    },
    preserve_energy: {
        constrains: ['systemPower'],
        propose(_order, { display, controls }) {
            const systems = (display.panels['full-systems-status'] ?? []) as unknown as SystemStatus[];
            const choice: Record<string, string> = {};
            for (const c of controls.filter((k) => k.command === 'systemPower')) {
                const pointer = c.id.slice('systemPower:'.length);
                const system = systems.find((s) => s.pointer === pointer);
                if (system && /^\/(thrusters|radars|tubes)\//.test(pointer) && system.power > THRIFTY_POWER + 0.01) {
                    choice[c.id] = 'lower';
                }
            }
            return choice;
        },
    },
};

const signalsExecutors: Record<string, OrderExecutor> = {
    preserve_energy: {
        constrains: ['pauseJobs'],
        // the beam scans while any ship on the radar is unidentified, and rests once every one is
        propose: (_order, { display }) =>
            (display.radar?.contacts ?? []).some((c) => c.scanLevel === 'UFO' && (c.radius ?? 0) >= 5)
                ? {}
                : { pauseJobs: 'on' },
    },
};

/** Each seat's executor per order kind. A kind a seat has no executor for leaves that seat to its policy. */
export const ORDER_EXECUTORS: Record<string, Record<string, OrderExecutor>> = {
    helms: helmsExecutors,
    weapons: weaponsExecutors,
    engineer: engineerExecutors,
    signals: signalsExecutors,
};

/**
 * Carries out the order board on top of a seat's policy. Each active order that binds `station`
 * proposes choices for the controls its executor constrains; per control, the order in the highest
 * ranked slot decides, and a control no order proposes keeps the policy's answer. A ship docked with no
 * dock order in force casts off.
 */
export function withOrderBoard(policy: Policy, station: string): Policy {
    const executors = ORDER_EXECUTORS[station] ?? {};
    const memory = new Map<string, unknown>();
    return {
        name: policy.name,
        async answer(request, controls, shown, heard) {
            const result = await policy.answer(request, controls, shown, heard);
            const display = shown as Display;
            const board = readOrders(display);
            const answers: Record<string, Answer> = { ...result.answers };
            const decided = new Set<string>();
            const take = (proposal: Partial<Record<string, string>>) => {
                for (const control of controls) {
                    const choice = proposal[control.id];
                    if (!decided.has(control.id) && choice !== undefined && choice in control.options) {
                        answers[control.id] = { choice, source: 'rule' };
                        decided.add(control.id);
                    }
                }
            };
            for (const order of ordersBinding(board, station)) {
                const executor = executors[order.kind];
                if (executor) take(executor.propose(order, { display, controls, base: result.answers, memory }));
            }
            const docked = station === 'helms' && docking(display) === DOCKING_MODE.DOCKED;
            if (docked && !board.orders.some((o) => o.kind === 'dock_for_repair' && o.status === 'active')) {
                take({ dock: 'press' });
            }
            return { ...result, answers };
        },
    };
}

function flyTo(at: XY, spot: XY, head: number) {
    const closing = scale(sub(spot, at), GAIN);
    const world = scale(closing, Math.min(1, ORDERED_SPEED / Math.max(length(closing), 1)));
    const rad = (-head * Math.PI) / 180;
    return {
        x: clamp((world.x * Math.cos(rad) - world.y * Math.sin(rad)) / MAX_SPEED),
        y: clamp((world.x * Math.sin(rad) + world.y * Math.cos(rad)) / MAX_SPEED),
    };
}

function bearingTo(at: XY, spot: XY) {
    const gap = sub(spot, at);
    return (Math.atan2(gap.y, gap.x) * 180) / Math.PI;
}

function delta(bearing: number, head: number) {
    return ((((bearing - head) % 360) + 540) % 360) - 180;
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));
const add = (a: XY, b: XY) => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: XY, b: XY) => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a: XY, f: number) => ({ x: a.x * f, y: a.y * f });
const length = (a: XY) => Math.hypot(a.x, a.y);
