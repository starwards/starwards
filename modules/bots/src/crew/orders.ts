import {
    CREW_ORDER_KINDS,
    CrewOrderBoard,
    DEFAULT_PRIORITIES,
    DOCK_BELOW_ARMOR_SHARE,
    IssueOrderArg,
    OrderIssuer,
    OrderParamsArg,
    OrderSlot,
    OrderStatus,
    RETREAT_RUN_METERS,
    ReportOrderProgressArg,
    RevokeOrderArg,
    SALVO_MISSILES,
    STANCES,
    boardRanking,
    crewOrderCommands,
    orderParams,
} from '@starwards/core/internal';

import { Display } from '../brain/controls';
import { SessionShipDriver } from '../session/session';

type XY = { x: number; y: number };

/** A world object an order names: its name, and where it was when the order was given. */
export type OrderRef = { name?: string; position?: XY; radius?: number };

/** An order's parameters as the seats read them. */
export type OrderParams = {
    /** A ship to close on, chase, engage or retreat from. */
    target?: OrderRef;
    /** A station to dock at. */
    station?: OrderRef;
    /** A region to patrol: a body (a nebula), kept between the ship and `from` (the threat). */
    region?: OrderRef & { from?: OrderRef };
    /** How close to the target a `close_to` order flies, metres. */
    range?: number;
    /** A share (0..1) a standing order triggers below. */
    threshold?: number;
    /** How many missiles a `salvo` keeps in flight. */
    count?: number;
    /** `revoke`: the slot it empties. */
    slot?: OrderSlot;
};

/** One order on the board as a seat reads it. */
export type Order = {
    id: number;
    kind: string;
    params: OrderParams;
    issuer: OrderIssuer;
    /** Where it came from within its issuer: the seat doctrine heard, a branch, a standing order. */
    origin: string;
    issuedAt: number;
    binds: readonly string[];
    status: OrderStatus;
    /** The current sub-goal of a composite order (`en_route`, `docking`, `docked`), and when it began. */
    step?: string;
    stepAt?: number;
    /** A plain progress note for the board: `en route, 2.1 km`, or why it was aborted. */
    note?: string;
    /** A standing order whose trigger already started its order. */
    fired: boolean;
};

/** What a seat's display shows, for an order's progress. */
export type ProgressView = { station: string; display: Display; seconds: number };

/** An order as given: a kind from the vocabulary (or `revoke`) and its parameters. */
export type GivenOrder = { kind: string; params?: OrderParams };

/** How an order kind moves through its steps, from what a seat shows. */
type OrderProgress = {
    /** Moves the order through its steps, completes or aborts it; undefined leaves it. */
    progress?(order: Order, view: ProgressView): Partial<Pick<Order, 'step' | 'status' | 'note'>> | undefined;
    /** A standing order that starts another order once its trigger holds. */
    trigger?(order: Order, view: ProgressView): GivenOrder | undefined;
};

/** `docking-status` mode numbers (`DockingMode`). */
export const DOCKING_MODE = { DOCKED: 0, UNDOCKED: 1, DOCKING: 2, UNDOCKING: 3 } as const;

type Contact = { name?: string; distance: number; position?: XY; radius?: number };
type Radar = { ownShip?: { position?: XY }; contacts?: Contact[] };
const own = (d: Display) => (d.radar as Radar | undefined)?.ownShip?.position;
const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
/** The share of armor plates still healthy a display shows. */
export const armorShare = (d: Display) => {
    const a = d.panels['armor-status'] as { numberOfPlates?: number; healthyPlates?: number } | undefined;
    return a?.numberOfPlates ? (a.healthyPlates ?? 0) / a.numberOfPlates : undefined;
};
const dockingMode = (d: Display) => (d.panels['docking-status'] as { mode?: number } | undefined)?.mode;

/** The contact a seat's radar shows under the reference's name, if any. */
export function seenAs(display: Display, ref: OrderRef | undefined): Contact | undefined {
    return ref?.name === undefined
        ? undefined
        : (display.radar as Radar | undefined)?.contacts?.find((c) => c.name === ref.name);
}

/** Where a reference is, read as its kind says: live from the seat's radar when it shows it, else as given. */
export function whereIs(display: Display, ref: OrderRef | undefined, mode: 'frozen' | 'live'): XY | undefined {
    return (mode === 'live' ? seenAs(display, ref)?.position : undefined) ?? ref?.position;
}

/** The progress and triggers of the kinds that have them; the kinds themselves are data in core (`CREW_ORDER_KINDS`). */
const ORDER_PROGRESS: Record<string, OrderProgress> = {
    chase_target: {
        progress: (order, { station, display }) =>
            station === 'weapons' && !seenAs(display, order.params.target)
                ? { status: 'aborted', note: 'target lost' }
                : undefined,
    },
    engage: {
        progress: (order, { station, display }) =>
            station === 'weapons' && order.params.target?.name !== undefined && !seenAs(display, order.params.target)
                ? { status: 'aborted', note: 'target lost or destroyed' }
                : undefined,
    },
    dock_for_repair: {
        progress(order, { station, display }) {
            if (station !== 'helms' || order.status !== 'active') return undefined;
            const mode = dockingMode(display);
            if (mode === DOCKING_MODE.DOCKED) return { step: 'docked', status: 'complete', note: 'docked, repairing' };
            if (mode === DOCKING_MODE.DOCKING) return { step: 'docking', note: 'docking' };
            const at = own(display);
            const s = order.params.station?.position;
            return at && s
                ? {
                      step: 'en_route',
                      note: `en route, ${km(Math.max(0, Math.hypot(s.x - at.x, s.y - at.y) - (order.params.station?.radius ?? 0)))}`,
                  }
                : undefined;
        },
    },
    undock: {
        progress: (_order, { station, display }) =>
            station === 'helms' && dockingMode(display) === DOCKING_MODE.UNDOCKED
                ? { status: 'complete', note: 'clear of the dock' }
                : undefined,
    },
    retreat: {
        progress(order, { station, display }) {
            const at = own(display);
            const t = whereIs(display, order.params.target, 'live');
            if (station !== 'helms' || !at || !t) return undefined;
            const away = Math.hypot(at.x - t.x, at.y - t.y);
            return away >= RETREAT_RUN_METERS ? { status: 'complete', note: 'clear' } : { note: `${km(away)} out` };
        },
    },
    dock_below_armor: {
        trigger(order, { station, display }) {
            const share = station === 'helms' ? armorShare(display) : undefined;
            return share !== undefined && share < (order.params.threshold ?? DOCK_BELOW_ARMOR_SHARE)
                ? { kind: 'dock_for_repair', params: { station: order.params.station } }
                : undefined;
        },
    },
};

/** A write to the order board, as one of its commands carries it. */
export type OrderCommand =
    | { command: 'issueOrder'; arg: IssueOrderArg }
    | { command: 'revokeOrder'; arg: RevokeOrderArg }
    | { command: 'reportOrderProgress'; arg: ReportOrderProgressArg };

/** Sends an order command through a ship driver: a seat's session in a live game or a headless one. */
export function sendOrderCommand(driver: Pick<SessionShipDriver, 'command'>, c: OrderCommand) {
    (driver.command as (cmd: unknown, value: unknown) => void)(crewOrderCommands[c.command], c.arg);
}

const ref = (r: OrderRef | undefined) =>
    r && {
        ...(r.name !== undefined ? { name: r.name } : {}),
        ...(r.position ? { position: r.position } : {}),
        ...(r.radius !== undefined ? { radius: r.radius } : {}),
    };

/** An order's parameters in the shape the board's commands carry (and give back from the board). */
export function paramsArg(p: OrderParams = {}): OrderParamsArg {
    const out: OrderParamsArg = {};
    if (p.target) out.target = ref(p.target);
    if (p.station) out.station = ref(p.station);
    if (p.region) out.region = ref(p.region);
    if (p.region?.from) out.from = ref(p.region.from);
    if (p.range !== undefined) out.range = p.range;
    if (p.threshold !== undefined) out.threshold = p.threshold;
    if (p.count !== undefined) out.count = p.count;
    return out;
}

function paramsOf(p: OrderParamsArg): OrderParams {
    const { from, region, ...rest } = p;
    return { ...rest, ...(region ? { region: { ...region, ...(from ? { from } : {}) } } : {}) };
}

/** The command that gives an order (`revoke` empties its `params.slot`). */
export function orderCommand(given: GivenOrder, issuer: OrderIssuer, origin = ''): OrderCommand | undefined {
    if (given.kind === 'revoke') {
        return given.params?.slot ? { command: 'revokeOrder', arg: { slot: given.params.slot, issuer } } : undefined;
    }
    return { command: 'issueOrder', arg: { kind: given.kind, params: paramsArg(given.params), issuer, origin } };
}

/** The order board panel as every seat sees it: each slot's order with its age and plain words, and the ranking. */
export const ORDERS_PANEL = 'orders';
export type ShownOrder = Order & { slot: OrderSlot; secondsAgo: number; words: string };
export type OrdersBoard = { orders: ShownOrder[]; priorities: OrderSlot[] };

/**
 * The ship's synced order board as seats read it, orders in priority order; `energySeats` are the
 * seats whose commands spend energy, bound by an order to preserve it. Undefined while no order was
 * ever placed, so a crew with neither captain nor doctrine reads no board.
 */
export function readBoard(board: CrewOrderBoard, energySeats: readonly string[]): OrdersBoard | undefined {
    if (!board.issued) return undefined;
    const priorities = boardRanking(board);
    return {
        orders: priorities.flatMap((slot): ShownOrder[] => {
            const o = board.slots.get(slot);
            const def = o && CREW_ORDER_KINDS[o.kind];
            if (!o || !def) return [];
            const params = paramsOf(orderParams(o.params));
            return [
                {
                    id: o.id,
                    kind: o.kind,
                    params,
                    issuer: o.issuer,
                    origin: o.origin,
                    issuedAt: o.issuedAt,
                    binds: def.binds === 'energy-drawing' ? energySeats : def.binds,
                    status: o.status,
                    ...(o.step ? { step: o.step, stepAt: o.stepAt } : {}),
                    ...(o.note ? { note: o.note } : {}),
                    fired: o.fired,
                    slot,
                    secondsAgo: board.seconds - o.issuedAt,
                    words: def.describe(paramsArg(params)),
                },
            ];
        }),
        priorities,
    };
}

/**
 * What a seat reports to the board after reading it: each order's progress as the seat's display
 * shows it (only where it changed), and every standing order whose trigger holds. A trigger takes its
 * target slot when idle, or from an order its own slot outranks; it fires once, under its own issuer.
 */
export function orderReports(board: OrdersBoard | undefined, view: ProgressView): OrderCommand[] {
    const out: OrderCommand[] = [];
    for (const order of board?.orders ?? []) {
        if (order.status === 'aborted') continue;
        const rules = ORDER_PROGRESS[order.kind];
        const change = order.status === 'active' ? rules?.progress?.(order, view) : undefined;
        if (change && Object.entries(change).some(([k, v]) => order[k as keyof Order] !== v)) {
            out.push({ command: 'reportOrderProgress', arg: { id: order.id, ...change } });
        }
        const started = order.fired ? undefined : rules?.trigger?.(order, view);
        const target = started && CREW_ORDER_KINDS[started.kind]?.slot;
        if (started && target && mayTake(board!, order.slot, target)) {
            out.push({ command: 'reportOrderProgress', arg: { id: order.id, fired: true } });
            const issue = orderCommand(started, order.issuer, `${order.kind} standing order`);
            if (issue) out.push(issue);
        }
    }
    return out;
}

function mayTake(board: OrdersBoard, from: OrderSlot, target: OrderSlot) {
    const occupant = board.orders.find((o) => o.slot === target);
    if (!occupant || occupant.status !== 'active') return true;
    return board.priorities.indexOf(from) < board.priorities.indexOf(target);
}

/** The order board a display shows; an empty board under the default ranking when it shows none. */
export function readOrders(display: Display | undefined): OrdersBoard {
    return (
        (display?.panels[ORDERS_PANEL] as OrdersBoard | undefined) ?? {
            orders: [],
            priorities: [...DEFAULT_PRIORITIES],
        }
    );
}

/** The orders on a board that bind `station` now (active, or complete and still holding), highest priority first. */
export function ordersBinding(board: OrdersBoard, station: string): ShownOrder[] {
    return board.orders.filter(
        (o) =>
            o.binds.includes(station) &&
            (o.status === 'active' ||
                (o.status === 'complete' && CREW_ORDER_KINDS[o.kind]?.holdsWhenComplete === true)),
    );
}

/** Who gave an order, in words: `the captain`, `doctrine, from signals`. */
function provenance(o: ShownOrder) {
    return o.issuer === 'doctrine' ? `doctrine${o.origin ? `, from ${o.origin}` : ''}` : `the captain`;
}

/** The order board read out in plain words, for the verbal view. */
export function ordersLines(board: OrdersBoard): string[] {
    const say = (o: ShownOrder) =>
        `${o.slot}: ${o.words}${o.status !== 'active' ? ` (${o.status}${o.note ? `: ${o.note}` : ''})` : o.note ? ` (${o.note})` : ''}, from ${provenance(o)} ${Math.round(o.secondsAgo)} s ago`;
    return [
        `Standing orders: ${board.orders.length ? board.orders.map(say).join('; ') : 'none'}.`,
        `Priorities: ${board.priorities.join(' > ')}.`,
    ];
}

/** One line per active slot, for branch-point summaries: `navigation=dock_for_repair:dock(docked)`. */
export function ordersSummary(board: OrdersBoard): string {
    const orders = board.orders.map(
        (o) =>
            `${o.slot}=${o.kind}${o.params.target?.name ? `:${o.params.target.name}` : ''}${o.params.station?.name ? `:${o.params.station.name}` : ''}${o.status !== 'active' ? `(${o.status})` : o.step ? `(${o.step})` : ''}${o.issuer === 'doctrine' ? '[doctrine]' : ''}`,
    );
    return [...orders, `priorities=${board.priorities.join('>')}`].join(' ');
}

/** The board's maneuver order to helms, in the shape the reference policy flies it. */
type HelmOrder = { kind: 'close'; spot: XY } | { kind: 'hold' };

/**
 * The board's maneuver order (`helm`), the ship it says to engage (`engage`) and the missiles a salvo
 * keeps in flight (`salvo`), for the reference seats.
 */
export function captainOrdersFromBoard(display: Display | undefined): {
    helm?: HelmOrder;
    engage?: string;
    salvo?: number;
} {
    const board = readOrders(display);
    const m = board.orders.find((o) => o.slot === 'maneuver' && o.status === 'active');
    let helm: HelmOrder | undefined;
    if (m?.kind === 'hold_here') {
        helm = { kind: 'hold' };
    } else if (m?.kind === 'close_to' && m.params.target?.position) {
        const at = own(display ?? { panels: {} });
        const t = m.params.target.position;
        const range = m.params.range ?? 0;
        if (at) {
            const d = Math.max(1, Math.hypot(t.x - at.x, t.y - at.y));
            // already within the ordered range: hold, never back off to it
            helm =
                d > range
                    ? {
                          kind: 'close',
                          spot: { x: t.x + ((at.x - t.x) * range) / d, y: t.y + ((at.y - t.y) * range) / d },
                      }
                    : { kind: 'hold' };
        }
    }
    const engage = board.orders.find((o) => o.kind === 'engage' && o.status === 'active');
    const salvo = board.orders.find((o) => o.kind === 'salvo' && o.status === 'active');
    return {
        helm,
        engage: engage?.params.target?.name,
        ...(salvo ? { salvo: salvo.params.count ?? SALVO_MISSILES } : {}),
    };
}

/** A world point `distance` km away on world `bearing` degrees (as a captain's callout fills them) from `origin`. */
function pointAt(origin: XY | undefined, distanceKm: string | undefined, bearing: string | undefined): XY | undefined {
    if (!origin || distanceKm === undefined || bearing === undefined) return undefined;
    const rad = (Number(bearing) * Math.PI) / 180;
    const run = Number(distanceKm) * 1000;
    return { x: origin.x + run * Math.cos(rad), y: origin.y + run * Math.sin(rad) };
}

type Values = Record<string, string>;
const calloutRef = (v: Values, origin: XY | undefined): OrderRef => {
    const position = pointAt(origin, v.distance, v.bearing);
    return {
        name: v.name,
        ...(position ? { position } : {}),
        ...(v.radius !== undefined ? { radius: Number(v.radius) * 1000 } : {}),
    };
};

/**
 * How each order callout becomes an order: its kind and its parameters from the values the speaker's
 * console filled in, resolved to world positions from the speaker's ship at `origin`. A callout not
 * listed here is talk, not an order.
 */
const CALLOUT_ORDERS: Record<string, (v: Values, origin: XY | undefined) => GivenOrder> = {
    close_to: (v, o) => ({ kind: 'close_to', params: { target: calloutRef(v, o), range: Number(v.range) * 1000 } }),
    hold_here: () => ({ kind: 'hold_here' }),
    engage: (v) => ({ kind: 'engage', params: { target: { name: v.name } } }),
    hold_fire: () => ({ kind: 'hold_fire' }),
    chase_target: (v, o) => ({ kind: 'chase_target', params: { target: calloutRef(v, o) } }),
    preserve_energy: () => ({ kind: 'preserve_energy' }),
    dock_for_repair: (v, o) => ({ kind: 'dock_for_repair', params: { station: calloutRef(v, o) } }),
    undock: () => ({ kind: 'undock' }),
    dock_below_armor: (v, o) => ({ kind: 'dock_below_armor', params: { station: calloutRef(v, o) } }),
    retreat: (v, o) => ({ kind: 'retreat', params: { target: calloutRef(v, o) } }),
    hold_position: () => ({ kind: 'hold_position' }),
    patrol: (v, o) => {
        const from = pointAt(o, v.fromDistance, v.fromBearing);
        return {
            kind: 'patrol',
            params: {
                region: { ...calloutRef(v, o), ...(from ? { from: { name: v.fromName, position: from } } : {}) },
            },
        };
    },
    push_on: () => ({ kind: 'revoke', params: { slot: 'navigation' } }),
    salvo: (v) => ({ kind: 'salvo', params: { count: Number(v.count) } }),
    ...Object.fromEntries(STANCES.map((s) => [s, () => ({ kind: s })])),
};

/** The order a callout gives, or undefined for talk. */
export function orderFromCallout(callout: string, values: Values | undefined, origin: XY | undefined) {
    return CALLOUT_ORDERS[callout]?.(values ?? {}, origin);
}
