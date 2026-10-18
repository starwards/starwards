import { Display } from '../brain/controls';

type XY = { x: number; y: number };

/**
 * The concerns an order can be about, one slot each. The order state holds at most one order per
 * slot; a new order replaces only the order in its own slot, and `revoke` empties one slot.
 * - `navigation`: where the ship goes on the mission (dock for repair, patrol, retreat, hold position).
 * - `maneuver`: the tactical maneuver call (close to, hold here, chase target).
 * - `stance`: how the crew fights (no kind yet).
 * - `energy`: the energy discipline (preserve energy).
 * - `engagement`: whom to fight (engage a named ship).
 * - `repair`: damage control (dock once armor falls low).
 * - `sensors`: emissions and scanning (no kind yet).
 */
export const ORDER_SLOTS = ['navigation', 'maneuver', 'stance', 'energy', 'engagement', 'repair', 'sensors'] as const;
export type OrderSlot = (typeof ORDER_SLOTS)[number];

/**
 * The slot ranking before the captain sets one. When two orders in force pull a seat's control two
 * ways, the higher slot's executor decides that control; the lower order still decides every control
 * the higher one leaves alone.
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

/** A world object an order names, resolved where it was when the order was given. */
export type OrderRef = { name?: string; position?: XY; radius?: number };

/** An order's parameters: what it names in the world, and the numbers it carries. */
export type OrderParams = {
    /** A ship to close on, chase, engage or retreat from. */
    target?: OrderRef;
    /** A station to dock at. */
    station?: OrderRef;
    /** A region to patrol: a body (a nebula), kept between the ship and `from` (the threat). */
    region?: OrderRef & { from?: XY };
    /** How close to the target a `close_to` order flies, metres. */
    range?: number;
    /** A share (0..1) a standing order triggers below. */
    threshold?: number;
    /** `revoke`: the slot it empties. */
    slot?: OrderSlot;
    /** `prioritize`: the new slot ranking, highest first; slots left out keep their order after it. */
    ranking?: OrderSlot[];
};

export type OrderStatus = 'active' | 'complete';

/** One order in force: its kind, parameters, who gave it and when, the seats it binds, and how far it has got. */
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

/** A kind of order, as data: its slot, the seats it binds, its plain words, and (composite orders) its progress. */
export type OrderKind = {
    /** `state`: an order about the order state itself (`revoke`, `prioritize`), kept in no slot. */
    slot: OrderSlot | 'state';
    /** The seats it binds; `energy-drawing` binds every seat whose commands spend energy (`energy-consumers.ts`). */
    binds: readonly string[] | 'energy-drawing';
    describe(params: OrderParams): string;
    /** Moves a composite order through its steps from what a seat shows; undefined leaves it as it is. */
    progress?(
        order: Order,
        view: ProgressView,
    ): Partial<Pick<Order, 'step' | 'stepAt' | 'status' | 'note'>> | undefined;
    /** A standing order that starts another order once its trigger holds, from what a seat shows. */
    trigger?(order: Order, view: ProgressView): GivenOrder | undefined;
};

/** `docking-status` mode numbers (`DockingMode`). */
export const DOCKING_MODE = { DOCKED: 0, UNDOCKED: 1, DOCKING: 2, UNDOCKING: 3 } as const;
/** How long a dock-for-repair order stays docked before it completes and the ship casts off. */
export const DOCK_DWELL_SECONDS = 60;
/** How far a retreat runs from the enemy before it completes, metres. */
export const RETREAT_RUN_METERS = 10_000;
/** The armor share under which `dock_below_armor` fires when the order names none. */
export const DOCK_BELOW_ARMOR_SHARE = 0.5;

type Radar = { ownShip?: { position?: XY } };
const own = (d: Display) => (d.radar as Radar | undefined)?.ownShip?.position;
const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
const named = (r: OrderRef | undefined, fallback: string) => r?.name ?? fallback;
const armorShare = (d: Display) => {
    const a = d.panels['armor-status'] as { numberOfPlates?: number; healthyPlates?: number } | undefined;
    return a?.numberOfPlates ? (a.healthyPlates ?? 0) / a.numberOfPlates : undefined;
};

/** Every order kind. A new kind is one entry here, and an executor per bound seat in `brain/order-executors.ts`. */
export const ORDER_KINDS: Record<string, OrderKind> = {
    close_to: {
        slot: 'maneuver',
        binds: ['helms'],
        describe: (p) => `close to ${km(p.range ?? 0)} of ${named(p.target, 'the enemy')}`,
    },
    hold_here: { slot: 'maneuver', binds: ['helms'], describe: () => 'hold here' },
    chase_target: {
        slot: 'maneuver',
        binds: ['helms', 'weapons'],
        describe: (p) => `chase ${named(p.target, 'the enemy')}`,
    },
    engage: {
        slot: 'engagement',
        binds: ['weapons', 'engineer'],
        describe: (p) => `engage ${named(p.target, 'the enemy')}`,
    },
    preserve_energy: {
        slot: 'energy',
        binds: 'energy-drawing',
        describe: () => 'preserve energy',
    },
    dock_for_repair: {
        slot: 'navigation',
        binds: ['helms', 'engineer'],
        describe: (p) => `dock at ${named(p.station, 'the station')} for armor repairs`,
        progress(order, { station, display, seconds }) {
            if (station !== 'helms') return undefined;
            const mode = (display.panels['docking-status'] as { mode?: number } | undefined)?.mode;
            if (mode === DOCKING_MODE.DOCKED) {
                const since = order.step === 'docked' ? (order.stepAt ?? seconds) : seconds;
                const done = seconds - since >= DOCK_DWELL_SECONDS;
                return {
                    step: 'docked',
                    stepAt: since,
                    note: done ? 'repaired' : 'docked, repairing',
                    ...(done ? { status: 'complete' as const } : {}),
                };
            }
            if (order.step === 'docked') return undefined;
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
    patrol: {
        slot: 'navigation',
        binds: ['helms'],
        describe: (p) => `patrol behind ${named(p.region, 'the region')}`,
    },
    retreat: {
        slot: 'navigation',
        binds: ['helms'],
        describe: (p) => `retreat from ${named(p.target, 'the enemy')}`,
        progress(order, { station, display }) {
            const at = own(display);
            const t = order.params.target?.position;
            if (station !== 'helms' || !at || !t) return undefined;
            const away = Math.hypot(at.x - t.x, at.y - t.y);
            return away >= RETREAT_RUN_METERS ? { status: 'complete', note: 'clear' } : { note: `${km(away)} out` };
        },
    },
    hold_position: { slot: 'navigation', binds: ['helms'], describe: () => 'hold position' },
    dock_below_armor: {
        slot: 'repair',
        binds: ['helms', 'engineer'],
        describe: (p) =>
            `dock at ${named(p.station, 'the station')} once armor falls below ${Math.round((p.threshold ?? DOCK_BELOW_ARMOR_SHARE) * 100)}%`,
        trigger(order, { station, display }) {
            const share = station === 'helms' ? armorShare(display) : undefined;
            return share !== undefined && share < (order.params.threshold ?? DOCK_BELOW_ARMOR_SHARE)
                ? { kind: 'dock_for_repair', params: { station: order.params.station } }
                : undefined;
        },
    },
    revoke: { slot: 'state', binds: [], describe: (p) => `revoke the ${p.slot ?? ''} order` },
    prioritize: {
        slot: 'state',
        binds: [],
        describe: (p) => `prioritize ${(p.ranking ?? []).join(' over ')}`,
    },
};

export type OrderState = {
    slots: Partial<Record<OrderSlot, Order>>;
    /** The captain-set slot ranking, highest first. */
    priorities: OrderSlot[];
    /** Who set the ranking, and when; absent while it is the default. */
    prioritizedBy?: { issuer: string; issuedAt: number };
};

/** An order as given: a kind from the vocabulary and its parameters. */
export type GivenOrder = { kind: string; params?: OrderParams };

/** A full ranking: `ranking` first, the remaining slots after it in their current order. */
export function rerank(current: readonly OrderSlot[], ranking: readonly OrderSlot[]): OrderSlot[] {
    return [...ranking, ...current.filter((s) => !ranking.includes(s))];
}

/**
 * The crew's order state over one run: changed by every order given (a captain's callout, or a branch
 * at its branch point), advanced by what the bound seats show, and read by every seat at every
 * decision as the `orders` panel. An order stays in force until another in its slot replaces it, it
 * completes, or its slot is revoked: the radio's hearing window and repeat suppression play no part.
 *
 * `seatCommands` names each seat's console commands, to bind energy orders to the seats that spend energy.
 */
export function crewOrders(energySeats: readonly string[] = []) {
    let state: OrderState = { slots: {}, priorities: [...DEFAULT_PRIORITIES] };
    /** Standing orders whose trigger already fired. */
    const fired = new Set<Order>();
    let version = 0;
    function give({ kind, params = {} }: GivenOrder, issuer: string, seconds: number) {
        const def = ORDER_KINDS[kind];
        if (!def) return;
        version++;
        if (kind === 'revoke') {
            if (params.slot) state = { ...state, slots: { ...state.slots, [params.slot]: undefined } };
            return;
        }
        if (kind === 'prioritize') {
            state = {
                ...state,
                priorities: rerank(state.priorities, params.ranking ?? []),
                prioritizedBy: { issuer, issuedAt: seconds },
            };
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
            version--;
            return;
        }
        const binds = def.binds === 'energy-drawing' ? energySeats : def.binds;
        const order: Order = { kind, params, issuer, issuedAt: seconds, binds, status: 'active' };
        state = { ...state, slots: { ...state.slots, [slot]: order } };
    }
    function advance(view: ProgressView) {
        for (const slot of ORDER_SLOTS) {
            const order = state.slots[slot];
            if (!order || order.status !== 'active') continue;
            const def = ORDER_KINDS[order.kind];
            const change = def?.progress?.(order, view);
            if (change && Object.entries(change).some(([k, v]) => order[k as keyof Order] !== v)) {
                state = { ...state, slots: { ...state.slots, [slot]: { ...order, ...change } } };
                version++;
            }
            const started = fired.has(order) ? undefined : def?.trigger?.(order, view);
            if (started) {
                const target = ORDER_KINDS[started.kind]?.slot;
                const busy = target !== undefined && target !== 'state' && state.slots[target]?.status === 'active';
                if (!busy) {
                    fired.add(order);
                    give(started, `${order.kind} standing order`, view.seconds);
                }
            }
        }
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
    return {
        orders: state.priorities.flatMap((slot) => {
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
        priorities: [...state.priorities],
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

/** The active orders on a board that bind `station`, highest priority first. */
export function ordersBinding(board: OrdersBoard, station: string): ShownOrder[] {
    return board.orders.filter((o) => o.status === 'active' && o.binds.includes(station));
}

/** The order board read out in plain words, for the verbal view. */
export function ordersLines(board: OrdersBoard): string[] {
    const say = (o: ShownOrder) =>
        `${o.slot}: ${o.words}${o.status === 'complete' ? ' (complete)' : o.note ? ` (${o.note})` : ''}, from the ${o.issuer} ${Math.round(o.secondsAgo)} s ago`;
    return [
        `Standing orders: ${board.orders.length ? board.orders.map(say).join('; ') : 'none'}.`,
        `Priorities: ${board.priorities.join(' > ')}.`,
    ];
}

/** One line per active slot, for branch-point summaries: `navigation=dock_for_repair(docked)`. */
export function ordersSummary(board: OrdersBoard): string {
    const orders = board.orders.map(
        (o) =>
            `${o.slot}=${o.kind}${o.params.target?.name ? `:${o.params.target.name}` : ''}${o.params.station?.name ? `:${o.params.station.name}` : ''}${o.status === 'complete' ? '(done)' : o.step ? `(${o.step})` : ''}`,
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
    const m = board.orders.find((o) => o.slot === 'maneuver');
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
    return { helm, engage: board.orders.find((o) => o.kind === 'engage')?.params.target?.name };
}

/** A world point `distance` km away on world `bearing` degrees (as a captain's callout fills them) from `origin`. */
function pointAt(origin: XY | undefined, distanceKm: string | undefined, bearing: string | undefined): XY | undefined {
    if (!origin || distanceKm === undefined || bearing === undefined) return undefined;
    const rad = (Number(bearing) * Math.PI) / 180;
    const run = Number(distanceKm) * 1000;
    return { x: origin.x + run * Math.cos(rad), y: origin.y + run * Math.sin(rad) };
}

type Values = Record<string, string>;
const ref = (v: Values, origin: XY | undefined): OrderRef => ({
    name: v.name,
    ...(pointAt(origin, v.distance, v.bearing) ? { position: pointAt(origin, v.distance, v.bearing) } : {}),
    ...(v.radius !== undefined ? { radius: Number(v.radius) * 1000 } : {}),
});

/**
 * How each order callout becomes an order: its kind and its parameters from the values the speaker's
 * console filled in, resolved to world positions from the speaker's ship at `origin`. A callout not
 * listed here is talk, not an order.
 */
const CALLOUT_ORDERS: Record<string, (v: Values, origin: XY | undefined) => GivenOrder> = {
    close_to: (v, o) => ({ kind: 'close_to', params: { target: ref(v, o), range: Number(v.range) * 1000 } }),
    hold_here: () => ({ kind: 'hold_here' }),
    engage: (v) => ({ kind: 'engage', params: { target: { name: v.name } } }),
    chase_target: (v, o) => ({ kind: 'chase_target', params: { target: ref(v, o) } }),
    preserve_energy: () => ({ kind: 'preserve_energy' }),
    dock_for_repair: (v, o) => ({ kind: 'dock_for_repair', params: { station: ref(v, o) } }),
    dock_below_armor: (v, o) => ({ kind: 'dock_below_armor', params: { station: ref(v, o) } }),
    retreat: (v, o) => ({ kind: 'retreat', params: { target: ref(v, o) } }),
    hold_position: () => ({ kind: 'hold_position' }),
    patrol: (v, o) => ({
        kind: 'patrol',
        params: { region: { ...ref(v, o), from: pointAt(o, v.fromDistance, v.fromBearing) } },
    }),
    push_on: () => ({ kind: 'revoke', params: { slot: 'navigation' } }),
};

/** The order a callout gives, or undefined for talk. */
export function orderFromCallout(callout: string, values: Values | undefined, origin: XY | undefined) {
    return CALLOUT_ORDERS[callout]?.(values ?? {}, origin);
}
