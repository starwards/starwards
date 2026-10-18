import { Display } from '../brain/controls';

type XY = { x: number; y: number };

/**
 * The concerns an order can be about, one slot each. The order state holds at most one order per
 * slot; a new order replaces only the order in its own slot (and any order it contradicts, see
 * `contradicts`), and `revoke` empties one slot.
 * - `navigation`: where the ship goes on the mission (dock for repair, undock, patrol, retreat, hold position).
 * - `maneuver`: the tactical maneuver call (close to, hold here, chase target).
 * - `stance`: how the crew fights; the stance also sets the slot ranking.
 * - `energy`: the energy discipline (preserve energy).
 * - `engagement`: whom to fight, or not to (engage a named ship, hold fire).
 * - `repair`: damage control (dock once armor falls low).
 * - `sensors`: emissions and scanning (no kind yet).
 */
export const ORDER_SLOTS = ['navigation', 'maneuver', 'stance', 'energy', 'engagement', 'repair', 'sensors'] as const;
export type OrderSlot = (typeof ORDER_SLOTS)[number];

/**
 * The slot ranking while no stance sets one. When two orders in force pull a seat's control two ways,
 * the order in the higher slot decides that control; the lower order still decides every control the
 * higher one leaves alone.
 */
export const DEFAULT_PRIORITIES: readonly OrderSlot[] = [
    'repair',
    'navigation',
    'engagement',
    'energy',
    'maneuver',
    'stance',
    'sensors',
];

/** A world object an order names: its name, and where it was when the order was given. */
export type OrderRef = { name?: string; position?: XY; radius?: number };

/** An order's parameters: what it names in the world, and the numbers it carries. */
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
    /** `revoke`: the slot it empties. */
    slot?: OrderSlot;
};

/** `aborted`: the order cannot be carried out any more (its target is gone); it stays on the board, saying why. */
export type OrderStatus = 'active' | 'complete' | 'aborted';

/** One order: its kind, parameters, who gave it and when, the seats it binds, and how far it has got. */
export type Order = {
    kind: string;
    params: OrderParams;
    issuer: string;
    issuedAt: number;
    binds: readonly string[];
    status: OrderStatus;
    /** The current sub-goal of a composite order (`en_route`, `docking`, `docked`), and when it began. */
    step?: string;
    stepAt?: number;
    /** A plain progress note for the board: `en route, 2.1 km`. */
    note?: string;
};

/** What a seat's display shows, for an order's progress. */
export type ProgressView = { station: string; display: Display; seconds: number };

/**
 * How an order's world reference is read by the seats that carry it out:
 * - `frozen`: the position given with the order, whatever the object does after;
 * - `live`: the named object as the seat's own radar shows it now, the given position only while it does not.
 * Every kind with a reference says which, and why.
 */
export type ReferenceMode = { mode: 'frozen' | 'live'; why: string };

/** A kind of order, as data. */
export type OrderKind = {
    /** `state`: an order about the order state itself (`revoke`), kept in no slot. */
    slot: OrderSlot | 'state';
    /** The seats it binds; `energy-drawing` binds every seat whose commands spend energy (`energy-consumers.ts`). */
    binds: readonly string[] | 'energy-drawing';
    /** How its world references are read, when it has any. */
    reference?: ReferenceMode;
    describe(params: OrderParams): string;
    /** Moves the order through its steps, completes or aborts it, from what a seat shows; undefined leaves it. */
    progress?(
        order: Order,
        view: ProgressView,
    ): Partial<Pick<Order, 'step' | 'stepAt' | 'status' | 'note'>> | undefined;
    /** A standing order that starts another order once its trigger holds, from what a seat shows. */
    trigger?(order: Order, view: ProgressView): GivenOrder | undefined;
    /** Order kinds this one cannot stand beside: giving either revokes the other, whatever their slots. */
    contradicts?: readonly string[];
    /** A completed order still binds its seats until replaced (docked, the ship stays docked and repairs). */
    holdsWhenComplete?: boolean;
    /** Stances: the slot ranking while this stance is in force. */
    ranking?: readonly OrderSlot[];
};

/** `docking-status` mode numbers (`DockingMode`). */
export const DOCKING_MODE = { DOCKED: 0, UNDOCKED: 1, DOCKING: 2, UNDOCKING: 3 } as const;
/** How far a retreat runs from the enemy before it completes, metres. */
export const RETREAT_RUN_METERS = 10_000;
/** The armor share under which `dock_below_armor` fires when the order names none. */
export const DOCK_BELOW_ARMOR_SHARE = 0.5;

type Contact = { name?: string; distance: number; position?: XY; radius?: number };
type Radar = { ownShip?: { position?: XY }; contacts?: Contact[] };
const own = (d: Display) => (d.radar as Radar | undefined)?.ownShip?.position;
const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
const named = (r: OrderRef | undefined, fallback: string) => r?.name ?? fallback;
const armorShare = (d: Display) => {
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
export function whereIs(display: Display, ref: OrderRef | undefined, mode: ReferenceMode['mode']): XY | undefined {
    return (mode === 'live' ? seenAs(display, ref)?.position : undefined) ?? ref?.position;
}

const FROZEN_CALL: ReferenceMode = {
    mode: 'frozen',
    why: 'the call names a point from the dradis at the moment it is given; the captain calls again with fresh numbers',
};
const LIVE_SHIP: ReferenceMode = {
    mode: 'live',
    why: 'a ship moves; the order is about the ship, not the spot it was on',
};
const FROZEN_STATION: ReferenceMode = {
    mode: 'frozen',
    why: 'stations do not move, and the order names the dock it was given',
};

/**
 * A stance's ranking: the slots in that order, the rest after them in the default order. A stance
 * never names a target or a place; it sets how seats fill their own policy and which orders win a
 * conflict.
 */
function stance(words: string, first: readonly OrderSlot[]): OrderKind {
    return {
        slot: 'stance',
        binds: ['helms', 'weapons', 'engineer', 'signals'],
        describe: () => words,
        ranking: [...first, ...DEFAULT_PRIORITIES.filter((s) => !first.includes(s))],
    };
}

/** Every order kind. A new kind is one entry here, and an executor per bound seat in `brain/order-executors.ts`. */
export const ORDER_KINDS: Record<string, OrderKind> = {
    close_to: {
        slot: 'maneuver',
        binds: ['helms'],
        reference: FROZEN_CALL,
        describe: (p) => `close to ${km(p.range ?? 0)} of ${named(p.target, 'the enemy')}`,
    },
    hold_here: { slot: 'maneuver', binds: ['helms'], describe: () => 'hold here' },
    chase_target: {
        slot: 'maneuver',
        binds: ['helms', 'weapons'],
        reference: LIVE_SHIP,
        describe: (p) => `chase ${named(p.target, 'the enemy')}`,
        contradicts: ['retreat', 'hold_position'],
        progress: (order, { station, display }) =>
            station === 'weapons' && !seenAs(display, order.params.target)
                ? { status: 'aborted', note: 'target lost' }
                : undefined,
    },
    engage: {
        slot: 'engagement',
        binds: ['weapons', 'engineer', 'helms'],
        reference: LIVE_SHIP,
        describe: (p) => `engage ${named(p.target, 'the enemy')}`,
        contradicts: ['hold_fire'],
        progress: (order, { station, display }) =>
            station === 'weapons' && order.params.target?.name !== undefined && !seenAs(display, order.params.target)
                ? { status: 'aborted', note: 'target lost or destroyed' }
                : undefined,
    },
    hold_fire: {
        slot: 'engagement',
        binds: ['weapons'],
        describe: () => 'hold fire',
        contradicts: ['engage'],
    },
    preserve_energy: {
        slot: 'energy',
        binds: 'energy-drawing',
        describe: () => 'preserve energy',
        contradicts: ['all_out'],
    },
    dock_for_repair: {
        slot: 'navigation',
        binds: ['helms', 'engineer'],
        reference: FROZEN_STATION,
        describe: (p) => `dock at ${named(p.station, 'the station')} for armor repairs`,
        holdsWhenComplete: true,
        progress(order, { station, display, seconds }) {
            if (station !== 'helms' || order.status !== 'active') return undefined;
            const mode = dockingMode(display);
            if (mode === DOCKING_MODE.DOCKED) {
                return { step: 'docked', stepAt: seconds, status: 'complete', note: 'docked, repairing' };
            }
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
        slot: 'navigation',
        binds: ['helms'],
        describe: () => 'cast off',
        progress: (_order, { station, display }) =>
            station === 'helms' && dockingMode(display) === DOCKING_MODE.UNDOCKED
                ? { status: 'complete', note: 'clear of the dock' }
                : undefined,
    },
    patrol: {
        slot: 'navigation',
        binds: ['helms'],
        reference: {
            mode: 'live',
            why: 'the nebula is fixed, but the side to hide on turns with the enemy: the threat is read live, the body as given',
        },
        describe: (p) => `patrol behind ${named(p.region, 'the region')}`,
    },
    retreat: {
        slot: 'navigation',
        binds: ['helms'],
        reference: { mode: 'live', why: 'the ship runs from where the enemy is now, not from where it was' },
        describe: (p) => `retreat from ${named(p.target, 'the enemy')}`,
        contradicts: ['chase_target', 'close_to'],
        progress(order, { station, display }) {
            const at = own(display);
            const t = whereIs(display, order.params.target, 'live');
            if (station !== 'helms' || !at || !t) return undefined;
            const away = Math.hypot(at.x - t.x, at.y - t.y);
            return away >= RETREAT_RUN_METERS ? { status: 'complete', note: 'clear' } : { note: `${km(away)} out` };
        },
    },
    hold_position: {
        slot: 'navigation',
        binds: ['helms'],
        describe: () => 'hold position',
        contradicts: ['chase_target', 'close_to'],
    },
    dock_below_armor: {
        slot: 'repair',
        binds: ['helms', 'engineer'],
        reference: FROZEN_STATION,
        describe: (p) =>
            `dock at ${named(p.station, 'the station')} once armor falls below ${Math.round((p.threshold ?? DOCK_BELOW_ARMOR_SHARE) * 100)}%`,
        trigger(order, { station, display }) {
            const share = station === 'helms' ? armorShare(display) : undefined;
            return share !== undefined && share < (order.params.threshold ?? DOCK_BELOW_ARMOR_SHARE)
                ? { kind: 'dock_for_repair', params: { station: order.params.station } }
                : undefined;
        },
    },
    defensive: stance('defensive: keep the ship whole, fight from range', [
        'repair',
        'navigation',
        'energy',
        'engagement',
    ]),
    offensive: stance('offensive: press the attack', ['engagement', 'maneuver', 'navigation']),
    all_out: {
        ...stance('all out: everything into the fight', ['engagement', 'maneuver']),
        contradicts: ['preserve_energy'],
    },
    chase: stance('chase: run them down', ['maneuver', 'engagement']),
    take_opportunities: stance('take opportunities: hit whatever comes close', ['engagement', 'navigation']),
    preserve_ammo: stance('preserve ammo: fire only where it tells', ['repair', 'navigation', 'energy']),
    revoke: { slot: 'state', binds: [], describe: (p) => `revoke the ${p.slot ?? ''} order` },
};

/** The stances, by kind. */
export const STANCES = Object.keys(ORDER_KINDS).filter((k) => ORDER_KINDS[k].ranking !== undefined);

export type OrderState = { slots: Partial<Record<OrderSlot, Order>> };

/** An order as given: a kind from the vocabulary and its parameters. */
export type GivenOrder = { kind: string; params?: OrderParams };

/** The slot ranking in force: the active stance's, else the default. */
export function rankingOf(state: OrderState): OrderSlot[] {
    const s = state.slots.stance;
    return [...((s && ORDER_KINDS[s.kind]?.ranking) ?? DEFAULT_PRIORITIES)];
}

/**
 * The crew's order state over one run: changed by every order given (a captain's callout, or a branch
 * at its branch point), advanced by what the bound seats show, and read by every seat at every
 * decision as the `orders` panel. An order stays until another in its slot replaces it, an order it
 * contradicts is given, it completes, or its slot is revoked: the radio's hearing window and repeat
 * suppression play no part.
 *
 * `energySeats` are the seats whose commands spend energy, bound by an order to preserve it (a function
 * for a crew whose seats come and go).
 */
export function crewOrders(energySeats: readonly string[] | (() => readonly string[]) = []) {
    let state: OrderState = { slots: {} };
    /** Standing orders whose trigger already fired. */
    const fired = new Set<Order>();
    let version = 0;
    function give({ kind, params = {} }: GivenOrder, issuer: string, seconds: number) {
        const def = ORDER_KINDS[kind];
        if (!def) return;
        if (kind === 'revoke') {
            if (params.slot && state.slots[params.slot]) {
                state = { slots: { ...state.slots, [params.slot]: undefined } };
                version++;
            }
            return;
        }
        const slot = def.slot as OrderSlot;
        const current = state.slots[slot];
        if (
            current?.kind === kind &&
            current.status === 'active' &&
            JSON.stringify(current.params) === JSON.stringify(params)
        ) {
            // the same order again: still the one given first
            return;
        }
        const binds =
            def.binds === 'energy-drawing'
                ? typeof energySeats === 'function'
                    ? energySeats()
                    : energySeats
                : def.binds;
        const slots = { ...state.slots };
        // contradictory orders cancel: the latest stands
        for (const other of ORDER_SLOTS) {
            const o = slots[other];
            if (o && (def.contradicts?.includes(o.kind) || ORDER_KINDS[o.kind]?.contradicts?.includes(kind))) {
                slots[other] = undefined;
            }
        }
        slots[slot] = { kind, params, issuer, issuedAt: seconds, binds, status: 'active' };
        state = { slots };
        version++;
    }
    function advance(view: ProgressView) {
        for (const slot of ORDER_SLOTS) {
            const order = state.slots[slot];
            if (!order || order.status === 'aborted') continue;
            const def = ORDER_KINDS[order.kind];
            const change = order.status === 'active' ? def?.progress?.(order, view) : undefined;
            if (change && Object.entries(change).some(([k, v]) => order[k as keyof Order] !== v)) {
                state = { slots: { ...state.slots, [slot]: { ...order, ...change } } };
                version++;
            }
            const started = fired.has(order) ? undefined : def?.trigger?.(order, view);
            const target = started && (ORDER_KINDS[started.kind]?.slot as OrderSlot | undefined);
            if (started && target && mayTake(slot, target)) {
                fired.add(order);
                give(started, `${order.kind} standing order`, view.seconds);
            }
        }
    }
    /** A standing order's trigger takes its target slot when idle, or from an order its own slot outranks. */
    function mayTake(from: OrderSlot, target: OrderSlot) {
        const occupant = state.slots[target];
        if (!occupant || occupant.status !== 'active') return true;
        const ranking = rankingOf(state);
        return ranking.indexOf(from) < ranking.indexOf(target);
    }
    return {
        give,
        advance,
        /** Replaces the whole state: a branch that sets the orders at its branch point. */
        set(next: OrderState) {
            state = next;
            version++;
        },
        get state(): OrderState {
            return state;
        },
        /** Bumped by every change: a recorder writes the state only when it moved. */
        get version() {
            return version;
        },
    };
}

export type CrewOrders = ReturnType<typeof crewOrders>;

/** The order board panel as every seat sees it: each slot's order with its age and plain words, and the ranking. */
export const ORDERS_PANEL = 'orders';
export type ShownOrder = Order & { slot: OrderSlot; secondsAgo: number; words: string };
export type OrdersBoard = { orders: ShownOrder[]; priorities: OrderSlot[] };

/** The board at `seconds`: orders in priority order. */
export function ordersBoard(state: OrderState, seconds: number): OrdersBoard {
    const priorities = rankingOf(state);
    return {
        orders: priorities.flatMap((slot) => {
            const o = state.slots[slot];
            return o
                ? [
                      {
                          ...o,
                          slot,
                          secondsAgo: seconds - o.issuedAt,
                          words: ORDER_KINDS[o.kind]?.describe(o.params) ?? o.kind,
                      },
                  ]
                : [];
        }),
        priorities,
    };
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
            (o.status === 'active' || (o.status === 'complete' && ORDER_KINDS[o.kind]?.holdsWhenComplete === true)),
    );
}

/** The order board read out in plain words, for the verbal view. */
export function ordersLines(board: OrdersBoard): string[] {
    const say = (o: ShownOrder) =>
        `${o.slot}: ${o.words}${o.status !== 'active' ? ` (${o.status}${o.note ? `: ${o.note}` : ''})` : o.note ? ` (${o.note})` : ''}, from the ${o.issuer} ${Math.round(o.secondsAgo)} s ago`;
    return [
        `Standing orders: ${board.orders.length ? board.orders.map(say).join('; ') : 'none'}.`,
        `Priorities: ${board.priorities.join(' > ')}.`,
    ];
}

/** One line per active slot, for branch-point summaries: `navigation=dock_for_repair:dock(docked)`. */
export function ordersSummary(board: OrdersBoard): string {
    const orders = board.orders.map(
        (o) =>
            `${o.slot}=${o.kind}${o.params.target?.name ? `:${o.params.target.name}` : ''}${o.params.station?.name ? `:${o.params.station.name}` : ''}${o.status !== 'active' ? `(${o.status})` : o.step ? `(${o.step})` : ''}`,
    );
    return [...orders, `priorities=${board.priorities.join('>')}`].join(' ');
}

/** The captain's maneuver order to helms, in the shape the reference policy's `captainOrders()` keeps it. */
type HelmOrder = { kind: 'close'; spot: XY; at: number } | { kind: 'hold'; at: number };

/**
 * Adapter for the reference policy: the order board as `captainOrders()` exposes it (`helm`, `engage`),
 * read from the board instead of remembered from the radio. `at` is in the board's seconds.
 */
export function captainOrdersFromBoard(display: Display | undefined): { helm?: HelmOrder; engage?: string } {
    const board = readOrders(display);
    const m = board.orders.find((o) => o.slot === 'maneuver' && o.status === 'active');
    let helm: HelmOrder | undefined;
    if (m?.kind === 'hold_here') {
        helm = { kind: 'hold', at: m.issuedAt };
    } else if (m?.kind === 'close_to' && m.params.target?.position) {
        const at = own(display ?? { panels: {} });
        const t = m.params.target.position;
        const range = m.params.range ?? 0;
        if (at) {
            const d = Math.max(1, Math.hypot(t.x - at.x, t.y - at.y));
            helm = {
                kind: 'close',
                spot: { x: t.x + ((at.x - t.x) * range) / d, y: t.y + ((at.y - t.y) * range) / d },
                at: m.issuedAt,
            };
        }
    }
    const engage = board.orders.find((o) => o.kind === 'engage' && o.status === 'active');
    return { helm, engage: engage?.params.target?.name };
}

/** A world point `distance` km away on world `bearing` degrees (as a captain's callout fills them) from `origin`. */
function pointAt(origin: XY | undefined, distanceKm: string | undefined, bearing: string | undefined): XY | undefined {
    if (!origin || distanceKm === undefined || bearing === undefined) return undefined;
    const rad = (Number(bearing) * Math.PI) / 180;
    const run = Number(distanceKm) * 1000;
    return { x: origin.x + run * Math.cos(rad), y: origin.y + run * Math.sin(rad) };
}

type Values = Record<string, string>;
const ref = (v: Values, origin: XY | undefined): OrderRef => {
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
    close_to: (v, o) => ({ kind: 'close_to', params: { target: ref(v, o), range: Number(v.range) * 1000 } }),
    hold_here: () => ({ kind: 'hold_here' }),
    engage: (v) => ({ kind: 'engage', params: { target: { name: v.name } } }),
    hold_fire: () => ({ kind: 'hold_fire' }),
    chase_target: (v, o) => ({ kind: 'chase_target', params: { target: ref(v, o) } }),
    preserve_energy: () => ({ kind: 'preserve_energy' }),
    dock_for_repair: (v, o) => ({ kind: 'dock_for_repair', params: { station: ref(v, o) } }),
    undock: () => ({ kind: 'undock' }),
    dock_below_armor: (v, o) => ({ kind: 'dock_below_armor', params: { station: ref(v, o) } }),
    retreat: (v, o) => ({ kind: 'retreat', params: { target: ref(v, o) } }),
    hold_position: () => ({ kind: 'hold_position' }),
    patrol: (v, o) => {
        const from = pointAt(o, v.fromDistance, v.fromBearing);
        return {
            kind: 'patrol',
            params: { region: { ...ref(v, o), ...(from ? { from: { name: v.fromName, position: from } } : {}) } },
        };
    },
    push_on: () => ({ kind: 'revoke', params: { slot: 'navigation' } }),
    ...Object.fromEntries(STANCES.map((s) => [s, () => ({ kind: s })])),
};

/** The order a callout gives, or undefined for talk. */
export function orderFromCallout(callout: string, values: Values | undefined, origin: XY | undefined) {
    return CALLOUT_ORDERS[callout]?.(values ?? {}, origin);
}
