import { MapSchema, Schema } from '@colyseus/schema';

import { gameField } from '../game-field';

/**
 * The concerns an order can be about, one slot each. The board holds at most one order per slot; a
 * new order replaces only the order in its own slot (and any order it contradicts, see
 * {@link CrewOrderKind.contradicts}), and a revoke empties one slot.
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
 * the order in the higher slot decides that control.
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

/**
 * Who put an order on the board. `captain`: a captain seat (bot or human); it binds. `doctrine`: the
 * crew's fixed standing procedure, which fills a slot only while no captain order holds it.
 */
export const ORDER_ISSUERS = ['captain', 'doctrine'] as const;
export type OrderIssuer = (typeof ORDER_ISSUERS)[number];

/** `aborted`: the order cannot be carried out any more (its target is gone); it stays on the board, saying why in `note`. */
export const ORDER_STATUSES = ['active', 'complete', 'aborted'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * The type of an order parameter, for a form that edits it:
 * - `contact`: a ship on the issuer's radar (name and position as the issuer sees it);
 * - `station`: a station to dock at (name, position, radius);
 * - `body`: a large body such as a nebula (name, position, radius);
 * - `meters`: a distance;
 * - `share`: a fraction 0..1.
 */
export type OrderParamType = 'contact' | 'station' | 'body' | 'meters' | 'share';
export const ORDER_PARAMS = {
    /** A ship to close on, chase, engage or retreat from. */
    target: 'contact',
    /** A station to dock at. */
    station: 'station',
    /** A region to patrol: a body (a nebula). */
    region: 'body',
    /** The threat a patrol keeps the region between it and. */
    from: 'contact',
    /** How close to the target a `close_to` order flies. */
    range: 'meters',
    /** The share a standing order triggers below. */
    threshold: 'share',
} as const satisfies Record<string, OrderParamType>;
export type OrderParamName = keyof typeof ORDER_PARAMS;
export const REF_PARAMS = ['target', 'station', 'region', 'from'] as const satisfies readonly OrderParamName[];
export type RefParamName = (typeof REF_PARAMS)[number];
export const NUMBER_PARAMS = ['range', 'threshold'] as const satisfies readonly OrderParamName[];

/** A world object an order names, as the issuer saw it when giving the order. */
export type OrderRefArg = { name?: string; position?: { x: number; y: number }; radius?: number };
/** An order's parameters as a command carries them. */
export type OrderParamsArg = Partial<Record<RefParamName, OrderRefArg> & Record<'range' | 'threshold', number>>;

/**
 * How an order's world reference is read by the seats that carry it out:
 * - `frozen`: the position given with the order, whatever the object does after;
 * - `live`: the named object as the seat's own radar shows it now, the given position only while it does not.
 */
export type ReferenceMode = { mode: 'frozen' | 'live'; why: string };

/** A kind of order, as data: what a form needs to offer it, and what the board needs to place it. */
export type CrewOrderKind = {
    slot: OrderSlot;
    /** The seats it binds; `energy-drawing` binds every seat whose commands spend energy. */
    binds: readonly string[] | 'energy-drawing';
    /** Its parameters: required or optional. */
    params: Partial<Record<OrderParamName, 'required' | 'optional'>>;
    /** How its world references are read, when it has any. */
    reference?: ReferenceMode;
    describe(params: OrderParamsArg): string;
    /** Order kinds this one cannot stand beside: giving either revokes the other, whatever their slots. */
    contradicts?: readonly string[];
    /** A completed order still binds its seats until replaced (docked, the ship stays docked and repairs). */
    holdsWhenComplete?: boolean;
    /** Stances: the slot ranking while this stance is in force. */
    ranking?: readonly OrderSlot[];
};

/** How far a retreat runs from the enemy before it completes, metres. */
export const RETREAT_RUN_METERS = 10_000;
/** The armor share under which `dock_below_armor` fires when the order names none. */
export const DOCK_BELOW_ARMOR_SHARE = 0.5;

const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
const named = (r: OrderRefArg | undefined, fallback: string) => r?.name ?? fallback;

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

/** A stance: its ranking is the slots given, the rest after them in the default order. */
function stance(words: string, first: readonly OrderSlot[]): CrewOrderKind {
    return {
        slot: 'stance',
        binds: ['helms', 'weapons', 'engineer', 'signals'],
        params: {},
        describe: () => words,
        ranking: [...first, ...DEFAULT_PRIORITIES.filter((s) => !first.includes(s))],
    };
}

/**
 * Every order kind. A new kind is one entry here, plus an executor per bound seat in the bots'
 * `brain/order-executors.ts` (and its progress rule in `crew/orders.ts`, if it has steps).
 */
export const CREW_ORDER_KINDS: Record<string, CrewOrderKind> = {
    close_to: {
        slot: 'maneuver',
        binds: ['helms'],
        params: { target: 'required', range: 'required' },
        reference: FROZEN_CALL,
        describe: (p) => `close to ${km(p.range ?? 0)} of ${named(p.target, 'the enemy')}`,
    },
    hold_here: { slot: 'maneuver', binds: ['helms'], params: {}, describe: () => 'hold here' },
    chase_target: {
        slot: 'maneuver',
        binds: ['helms', 'weapons'],
        params: { target: 'required' },
        reference: LIVE_SHIP,
        describe: (p) => `chase ${named(p.target, 'the enemy')}`,
        contradicts: ['retreat', 'hold_position'],
    },
    engage: {
        slot: 'engagement',
        binds: ['weapons', 'engineer', 'helms'],
        params: { target: 'optional' },
        reference: LIVE_SHIP,
        describe: (p) => `engage ${named(p.target, 'the enemy')}`,
        contradicts: ['hold_fire'],
    },
    hold_fire: {
        slot: 'engagement',
        binds: ['weapons'],
        params: {},
        describe: () => 'hold fire',
        contradicts: ['engage'],
    },
    preserve_energy: {
        slot: 'energy',
        binds: 'energy-drawing',
        params: {},
        describe: () => 'preserve energy',
        contradicts: ['all_out'],
    },
    dock_for_repair: {
        slot: 'navigation',
        binds: ['helms', 'engineer'],
        params: { station: 'required' },
        reference: FROZEN_STATION,
        describe: (p) => `dock at ${named(p.station, 'the station')} for armor repairs`,
        holdsWhenComplete: true,
    },
    undock: { slot: 'navigation', binds: ['helms'], params: {}, describe: () => 'cast off' },
    patrol: {
        slot: 'navigation',
        binds: ['helms'],
        params: { region: 'required', from: 'optional' },
        reference: {
            mode: 'live',
            why: 'the nebula is fixed, but the side to hide on turns with the enemy: the threat is read live, the body as given',
        },
        describe: (p) => `patrol behind ${named(p.region, 'the region')}`,
    },
    retreat: {
        slot: 'navigation',
        binds: ['helms'],
        params: { target: 'required' },
        reference: { mode: 'live', why: 'the ship runs from where the enemy is now, not from where it was' },
        describe: (p) => `retreat from ${named(p.target, 'the enemy')}`,
        contradicts: ['chase_target', 'close_to'],
    },
    hold_position: {
        slot: 'navigation',
        binds: ['helms'],
        params: {},
        describe: () => 'hold position',
        contradicts: ['chase_target', 'close_to'],
    },
    dock_below_armor: {
        slot: 'repair',
        binds: ['helms', 'engineer'],
        params: { station: 'required', threshold: 'optional' },
        reference: FROZEN_STATION,
        describe: (p) =>
            `dock at ${named(p.station, 'the station')} once armor falls below ${Math.round((p.threshold ?? DOCK_BELOW_ARMOR_SHARE) * 100)}%`,
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
};

/** The stances, by kind. */
export const STANCES = Object.keys(CREW_ORDER_KINDS).filter((k) => CREW_ORDER_KINDS[k].ranking !== undefined);

/** A world object an order names. Not given while `given` is false; `positioned` says whether `x`/`y` hold. */
export class CrewOrderRef extends Schema {
    @gameField('boolean') given = false;
    /** The name the issuer's radar showed, '' when it showed none. */
    @gameField('string') name = '';
    @gameField('boolean') positioned = false;
    @gameField('float64') x = 0;
    @gameField('float64') y = 0;
    /** Metres; 0 when not given. */
    @gameField('float64') radius = 0;
}

/** An order's parameters, typed per {@link ORDER_PARAMS}. A number of 0 is not given. */
export class CrewOrderParams extends Schema {
    @gameField(CrewOrderRef) target = new CrewOrderRef();
    @gameField(CrewOrderRef) station = new CrewOrderRef();
    @gameField(CrewOrderRef) region = new CrewOrderRef();
    @gameField(CrewOrderRef) from = new CrewOrderRef();
    /** Metres. */
    @gameField('float64') range = 0;
    @gameField('float64') threshold = 0;
}

/** One order on the board: its kind and parameters, who gave it and when, and how far it has got. */
export class CrewOrder extends Schema {
    /** Unique on this board, increasing: progress reports name the order they are about. */
    @gameField('uint32') id = 0;
    @gameField('string') kind = '';
    @gameField(CrewOrderParams) params = new CrewOrderParams();
    /** {@link OrderIssuer}. */
    @gameField('string') issuer: OrderIssuer = 'captain';
    /** Where it came from within its issuer: the seat a doctrine rule heard, a branch, a standing order. '' for none. */
    @gameField('string') origin = '';
    /** Board seconds ({@link CrewOrderBoard.seconds}) at which it was given. */
    @gameField('float64') issuedAt = 0;
    /** {@link OrderStatus}. */
    @gameField('string') status: OrderStatus = 'active';
    /** The current sub-goal of a composite order (`en_route`, `docking`, `docked`), '' for none. */
    @gameField('string') step = '';
    /** Board seconds at which `step` began. */
    @gameField('float64') stepAt = 0;
    /** A plain progress note, or why it was aborted: `en route, 2.1 km`, `target lost`. */
    @gameField('string') note = '';
    /** A standing order whose trigger already started its order. */
    @gameField('boolean') fired = false;
}

export type IssueOrderArg = { kind: string; params?: OrderParamsArg; issuer: OrderIssuer; origin?: string };
export type RevokeOrderArg = { slot: OrderSlot; issuer: OrderIssuer };
export type ReportOrderProgressArg = {
    id: number;
    step?: string;
    status?: OrderStatus;
    note?: string;
    fired?: boolean;
};

export type CrewOrderCommand =
    | ({ type: 'issue' } & IssueOrderArg)
    | ({ type: 'revoke' } & RevokeOrderArg)
    | ({ type: 'progress' } & ReportOrderProgressArg);

/**
 * A ship's order board: one order per slot, the active stance in the `stance` slot. Synced to the
 * ship room (the ship's own stations and the GM), recorded in every frame, and written only through
 * `crewOrderCommands`, which `CrewOrdersManager` validates.
 */
export class CrewOrderBoard extends Schema {
    /** By {@link OrderSlot}. */
    @gameField({ map: CrewOrder }) slots = new MapSchema<CrewOrder>();
    /** Orders ever placed on this board: the last order's id. */
    @gameField('uint32') issued = 0;
    /** Game seconds now, the clock `issuedAt` and `stepAt` are on. */
    @gameField('float64') seconds = 0;

    // server only, used for commands
    public commands = Array.of<CrewOrderCommand>();
}

/** The slot ranking in force: the active stance's, else the default. */
export function boardRanking(board: CrewOrderBoard): OrderSlot[] {
    const s = board.slots.get('stance');
    return [...((s && CREW_ORDER_KINDS[s.kind]?.ranking) ?? DEFAULT_PRIORITIES)];
}

/** An order's parameters read back from the board, in the shape a command gives them. */
export function orderParams(p: CrewOrderParams): OrderParamsArg {
    const out: OrderParamsArg = {};
    for (const name of REF_PARAMS) {
        const r = p[name];
        if (!r.given) continue;
        out[name] = {
            ...(r.name ? { name: r.name } : {}),
            ...(r.positioned ? { position: { x: r.x, y: r.y } } : {}),
            ...(r.radius ? { radius: r.radius } : {}),
        };
    }
    for (const name of NUMBER_PARAMS) {
        if (p[name]) out[name] = p[name];
    }
    return out;
}
