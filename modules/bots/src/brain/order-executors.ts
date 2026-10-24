import { Answer, Policy } from './brain';
import { CREW_ORDER_KINDS, RETREAT_RUN_METERS, SALVO_MISSILES } from '@starwards/core/internal';
import { DOCKING_MODE, ShownOrder, focusTarget, ordersBinding, readOrders, whereIs } from '../crew/orders';
import { flightSeconds, stillFlying } from './salvo';

import { Control } from './controls';
import { checkFireOf } from './callout';
import { isEnemyShip } from './enemy';

type XY = { x: number; y: number };
type Contact = {
    id?: string;
    name?: string;
    distance: number;
    bearing: number;
    position?: XY;
    radius?: number;
    type?: string;
    faction?: number;
    scanLevel?: string;
};
type Radar = { ownShip?: { heading?: number; position?: XY; faction?: number }; contacts?: Contact[] };
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
    /** The seat's display at its previous decision. */
    previous?: Display;
};

/**
 * How one seat carries out one order kind (or stance): the commands whose controls it may decide
 * (`constrains`) and, at each decision, its choice for some of them. Where two orders in force propose
 * different choices for one control, the order in the higher-ranked slot decides it; every other
 * control of the lower order still goes its way. The trade-off is per control and readable from `constrains`.
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
/** Preserve energy and preserve ammo: fire only inside this range; thrust stays under this share. */
const THRIFTY_FIRE_METERS = 3_000;
const THRIFTY_THRUST = 0.5;
const THRIFTY_POWER = 0.5;
/** Defensive: the chain gun fires only inside this range (its fuse reaches 8 km). */
const DEFENSIVE_FIRE_METERS = 4_000;
/** Take opportunities: switch the lock to an enemy this much nearer than the locked one. */
const OPPORTUNITY_METERS = 2_000;
const VELOCITY = 1;
const TARGET_MODE = 2;
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
/** Where an order's reference is for this seat, read frozen or live as its kind declares. */
const where = (d: Display, order: ShownOrder, ref: 'target' | 'station') =>
    whereIs(d, order.params[ref], CREW_ORDER_KINDS[order.kind]?.reference?.mode ?? 'frozen');
const lockOf = (d: Display) => {
    const id = (d.panels['targeting-status'] as { targetId?: string } | undefined)?.targetId;
    return d.radar?.contacts?.find((c) => c.id === id);
};
/** The nearest ship the radar shows as another faction's. */
const nearestEnemy = (d: Display) => {
    const faction = d.radar?.ownShip?.faction;
    return (d.radar?.contacts ?? []).filter((c) => isEnemyShip(c, faction)).sort((a, b) => a.distance - b.distance)[0];
};
/** Holds the named fire controls while the locked target is beyond `meters`. */
function holdFireBeyond(
    display: Display,
    controls: readonly Control[],
    meters: number,
    commands: readonly string[] = ['fireChainGun', 'fireTube'],
) {
    const lock = lockOf(display);
    return lock && lock.distance <= meters
        ? {}
        : Object.fromEntries(controls.filter((c) => commands.includes(c.command)).map((c) => [c.id, 'hold_fire']));
}
/** Raises every `systemPower` control of systems matching `pattern` toward `goal`. */
function powerUp(display: Display, controls: readonly Control[], pattern: RegExp, goal = 1) {
    const systems = (display.panels['full-systems-status'] ?? []) as unknown as SystemStatus[];
    return Object.fromEntries(
        controls
            .filter((c) => c.command === 'systemPower' && pattern.test(c.id.slice('systemPower:'.length)))
            .flatMap((c) => {
                const power = systems.find((s) => s.pointer === c.id.slice('systemPower:'.length))?.power;
                return power === undefined ? [] : [[c.id, power < goal - 0.01 ? 'raise' : 'hold']];
            }),
    );
}
/** Afterburner on while the nearest enemy is far and on the nose: a stance that closes fast. */
function burnAtEnemy(display: Display): Record<string, string> {
    const enemy = nearestEnemy(display);
    return enemy && enemy.distance > PURSUIT_METERS && Math.abs(delta(enemy.bearing, heading(display))) < 15
        ? { afterBurner: 'engage' }
        : {};
}
/** A rotation key choice that eases the turn rate toward the bearing `off` degrees off the nose. */
function turnToward(helms: Helms, off: number) {
    const turn = Number(helms.rotationCommand ?? 0);
    const goal = Math.max(-TURN_RATE, Math.min(TURN_RATE, (off / 60) * TURN_RATE));
    return turn < goal - 0.025 ? 'right' : turn > goal + 0.025 ? 'left' : 'hold';
}

/** Helm choices that fly the ship to `spot` (world) and stop there; no spot holds it where it is. */
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
    choice.rotation = spot ? turnToward(helms, off) : 'centre';
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
            // docking or docked, the autopilot and the clamp hold the ship until the captain orders it off
            if (order.status === 'complete' || mode === DOCKING_MODE.DOCKING || mode === DOCKING_MODE.DOCKED) {
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
    undock: {
        constrains: ['dock'],
        propose: (_order, { display }) => ({ dock: docking(display) === DOCKING_MODE.DOCKED ? 'press' : 'wait' }),
    },
    retreat: {
        constrains: HELM,
        propose(order, { display }) {
            const from = where(display, order, 'target');
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
            // the body is fixed; the side to hide on follows the threat as this seat sees it
            const from = whereIs(display, region.from, 'live') ?? own(display);
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
            const spot = where(display, order, 'target');
            return spot ? flyHelm(display, spot) : {};
        },
    },
    focus: {
        // the nose follows the focus as the engagement's does its named ship
        constrains: ['rotation'],
        propose(order, { display, previous }) {
            const helms = display.panels['helms-stats'] as Helms | undefined;
            const contact = focusTarget(order.params, display, previous);
            if (!helms || !contact || helms.rotationMode === TARGET_MODE) return {};
            const at = contact.position && bearingTo(own(display), contact.position);
            return at === undefined ? {} : { rotation: turnToward(helms, delta(at, heading(display))) };
        },
    },
    engage: {
        // the gun is bolted to the nose: an engagement turns the ship onto its target, unless the smart pilot already holds it there
        constrains: ['rotation'],
        propose(order, { display }) {
            const helms = display.panels['helms-stats'] as Helms | undefined;
            const contact = seen(display, order.params.target?.name);
            if (!helms || !contact || helms.rotationMode === TARGET_MODE) return {};
            return { rotation: turnToward(helms, delta(contact.bearing, heading(display))) };
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
    defensive: { constrains: ['afterBurner'], propose: () => ({ afterBurner: 'release' }) },
    all_out: { constrains: ['afterBurner'], propose: (_o, { display }) => burnAtEnemy(display) },
    chase: { constrains: ['afterBurner'], propose: (_o, { display }) => burnAtEnemy(display) },
};

/** Weapons cycles its lock until it holds the order's named ship, while its radar shows it. */
const lockNamed: OrderExecutor = {
    constrains: ['target'],
    propose(order, { display }) {
        const wanted = order.params.target?.name;
        return wanted && seen(display, wanted) && lockOf(display)?.name !== wanted ? { target: 'next' } : {};
    },
};

/** The tubes held: every launch held and every tube's safety on. */
function holdTubes(controls: readonly Control[]) {
    return Object.fromEntries(
        controls.flatMap((c) =>
            c.command === 'tubeSafety' ? [[c.id, 'on']] : c.command === 'fireTube' ? [[c.id, 'hold_fire']] : [],
        ),
    );
}

/**
 * Weapons lets its policy launch until `count` missiles of the salvo fly, then holds the tubes; a
 * missile counts until it is due at the target, so one that arrived without a kill frees a launch.
 * Each launch it lets through is due after the flight time to the lock as it closes.
 */
const salvoDiscipline: OrderExecutor = {
    constrains: ['fireTube', 'tubeSafety'],
    propose(order, { display, controls, base, memory }) {
        const now = order.issuedAt + order.secondsAgo;
        const lock = lockOf(display);
        const fix = memory.get('salvoFix') as { id?: string; distance: number; at: number } | undefined;
        const closing =
            lock && fix && fix.id === lock.id && now > fix.at ? (fix.distance - lock.distance) / (now - fix.at) : 0;
        if (lock) memory.set('salvoFix', { id: lock.id, distance: lock.distance, at: now });
        const launches = controls.filter((c) => c.command === 'fireTube' && base[c.id]?.choice === 'fire');
        if (!launches.length) return {};
        const key = `salvo:${order.id}`;
        const arrivals = (memory.get(key) as number[] | undefined) ?? [];
        if (stillFlying(arrivals, now) >= (order.params.count ?? SALVO_MISSILES)) return holdTubes(controls);
        const due = now + flightSeconds(lock?.distance ?? 0, closing);
        memory.set(key, [...arrivals, ...launches.map(() => due)]);
        return {};
    },
};

/** Weapons cycles its lock until it holds the ship the focus points at now. */
const lockFocus: OrderExecutor = {
    constrains: ['target'],
    propose(order, { display, previous }) {
        const wanted = focusTarget(order.params, display, previous)?.name;
        return wanted && lockOf(display)?.name !== wanted ? { target: 'next' } : {};
    },
};

/** Gun and tubes held. */
function holdFire(controls: readonly Control[]) {
    return {
        ...holdTubes(controls),
        ...Object.fromEntries(controls.filter((c) => c.command === 'fireChainGun').map((c) => [c.id, 'hold_fire'])),
    };
}

const weaponsExecutors: Record<string, OrderExecutor> = {
    focus: lockFocus,
    chase_target: lockNamed,
    engage: lockNamed,
    hold_fire: {
        constrains: ['fireChainGun', 'fireTube', 'tubeSafety'],
        propose: (_o, { controls }) => holdFire(controls),
    },
    salvo: salvoDiscipline,
    /** Gun and tubes held while the line of fire shows an ally (the named one, when the order names one). */
    check_fire: {
        constrains: ['fireChainGun', 'fireTube', 'tubeSafety'],
        propose(order, { display, controls }) {
            const shown = checkFireOf(display.panels);
            const named = order.params.target?.name;
            return shown && (!named || shown.ally.name === named) ? holdFire(controls) : {};
        },
    },
    preserve_energy: {
        constrains: ['fireChainGun'],
        propose: (_o, { display, controls }) =>
            holdFireBeyond(display, controls, THRIFTY_FIRE_METERS, ['fireChainGun']),
    },
    defensive: {
        constrains: ['fireChainGun'],
        propose: (_o, { display, controls }) =>
            holdFireBeyond(display, controls, DEFENSIVE_FIRE_METERS, ['fireChainGun']),
    },
    preserve_ammo: {
        constrains: ['fireChainGun', 'fireTube'],
        propose: (_o, { display, controls }) => holdFireBeyond(display, controls, THRIFTY_FIRE_METERS),
    },
    take_opportunities: {
        constrains: ['target'],
        propose(_o, { display }) {
            const lock = lockOf(display);
            const nearest = nearestEnemy(display);
            return lock && nearest && nearest.distance < lock.distance - OPPORTUNITY_METERS ? { target: 'next' } : {};
        },
    },
};

const engineerExecutors: Record<string, OrderExecutor> = {
    dock_for_repair: {
        constrains: ['cycleRepairPriority', 'systemPower'],
        propose(order, { display, controls }) {
            // en route the thrusters get full power; docked, the docked-tier repairs run
            if (order.status !== 'complete') return powerUp(display, controls, /^\/thrusters\//);
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
    offensive: {
        constrains: ['systemPower'],
        propose: (_o, { display, controls }) => powerUp(display, controls, /^\/chainGuns\//),
    },
    all_out: {
        constrains: ['systemPower'],
        propose: (_o, { display, controls }) => powerUp(display, controls, /^\/(chainGuns|tubes|thrusters)\//),
    },
};

const signalsExecutors: Record<string, OrderExecutor> = {
    preserve_energy: {
        constrains: ['pauseJobs'],
        // the beam scans while any ship-sized contact is unidentified, and rests once every one is
        propose: (_order, { display }) =>
            (display.radar?.contacts ?? []).some((c) => c.scanLevel === 'UFO' && (c.radius ?? 0) >= 5)
                ? {}
                : { pauseJobs: 'on' },
    },
};

/** Each seat's executor per order kind (stances included). A kind a seat has no executor for leaves that seat to its policy. */
export const ORDER_EXECUTORS: Record<string, Record<string, OrderExecutor>> = {
    helms: helmsExecutors,
    weapons: weaponsExecutors,
    engineer: engineerExecutors,
    signals: signalsExecutors,
};

/**
 * Carries out the order board on top of a seat's policy. Each order that binds `station` proposes
 * choices for the controls its executor constrains; per control, the order in the highest-ranked slot
 * decides (the ranking is the active stance's), and a control no order proposes keeps the policy's answer.
 */
export function withOrderBoard(policy: Policy, station: string): Policy {
    const executors = ORDER_EXECUTORS[station] ?? {};
    const memory = new Map<string, unknown>();
    let previous: Display | undefined;
    return {
        name: policy.name,
        async answer(request, controls, shown, heard) {
            const result = await policy.answer(request, controls, shown, heard);
            const display = shown as Display;
            const board = readOrders(shown);
            const answers: Record<string, Answer> = { ...result.answers };
            const decided = new Set<string>();
            for (const order of ordersBinding(board, station)) {
                const executor = executors[order.kind];
                if (!executor) continue;
                const proposal = executor.propose(order, {
                    display,
                    controls,
                    base: result.answers,
                    memory,
                    previous,
                });
                for (const control of controls) {
                    const choice = proposal[control.id];
                    if (!decided.has(control.id) && choice !== undefined && choice in control.options) {
                        answers[control.id] = { choice, source: 'rule' };
                        decided.add(control.id);
                    }
                }
            }
            previous = display;
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
