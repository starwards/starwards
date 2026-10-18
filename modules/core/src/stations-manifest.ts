/**
 * The stations manifest: what a station may see and do.
 *
 * A station is a seat on the bridge. The browser client expresses that seat as a screen — a set of
 * widgets it draws and a set of input actions it wires — and headless clients (the MCP server) need
 * the same boundary expressed as data. This module is that vocabulary, and the server serves a
 * manifest per ship so there is one source of truth for both.
 *
 * Deny by default: an entry that lists nothing grants nothing.
 */

/**
 * Read surfaces. Each flag is a widget the browser client draws, and admits exactly the state that
 * widget displays. Radar widgets additionally carry their own visibility filtering — see
 * `stationRadarWidgets`.
 */
export const stationWidgets = [
    'helms-radar',
    'tactical-radar',
    'long-range-radar',
    'dradis-radar',
    'helms-stats',
    'systems-status',
    'full-systems-status',
    'engineering-status',
    'warp-status',
    'docking-status',
    'armor-status',
    'damage-report',
    'repair-queue',
    'tubes-status',
    'ammo-status',
    'targeting-status',
    'gun-status',
    'target-info',
    'signals-jobs',
    'waypoint-groups',
    'waypoint-edit',
] as const;

export type StationWidget = (typeof stationWidgets)[number];

/**
 * The radar widgets, in the order of preference used when a station holds more than one. A station
 * without any of these has no view of space at all.
 */
export const stationRadarWidgets = ['tactical-radar', 'helms-radar', 'long-range-radar', 'dradis-radar'] as const;

export type StationRadarWidget = (typeof stationRadarWidgets)[number];

export function isRadarWidget(widget: StationWidget): widget is StationRadarWidget {
    return (stationRadarWidgets as readonly StationWidget[]).includes(widget);
}

/**
 * Write surfaces. Each flag is one named input action wired by a station screen, and admits exactly
 * the command(s) that action sends. View-state actions (zoom, pan, follow, client-local target
 * cycling) have no flag — they change nothing a remote client can observe, and a headless client
 * always reads the full scope its widgets admit.
 */
export const stationCommands = [
    // helms
    'rotation',
    'strafe',
    'boost',
    'resetRotationOffset',
    'rotationMode',
    'maneuveringMode',
    'afterBurner',
    'antiDrift',
    'breaks',
    'warpUp',
    'warpDown',
    'dock',
    // weapons
    'nextTarget',
    'prevTarget',
    'clearTarget',
    'targetShipsOnly',
    'targetEnemyOnly',
    'targetShortRangeOnly',
    'fireTube',
    'loadTube',
    'changeTubeAmmo',
    'tubeSafety',
    'fireChainGun',
    'loadChainGun',
    'changeGunAmmo',
    // engineering
    'systemPower',
    'systemCoolant',
    'warpFrequency',
    'changeFrequency',
    'cycleRepairPriority',
    'toggleRepairProtocolMode',
    // signals
    'beamDirection',
    'beamArc',
    'pauseJobs',
    'prioritizeJob',
    'cancelJob',
    // dradis
    'placeWaypoint',
    'editWaypoint',
    'moveWaypoint',
    'deleteWaypoint',
] as const;

export type StationCommand = (typeof stationCommands)[number];

/** One station's sandbox. Absent fields grant nothing. */
export type StationEntry = {
    /** A station is selectable only when explicitly enabled. */
    enabled?: boolean;
    /**
     * Game-master seat: sees all of space at full scan level and may tweak any commandable field.
     * `widgets` and `commands` do not apply.
     */
    gm?: boolean;
    widgets?: StationWidget[];
    commands?: StationCommand[];
    /** Briefing handed to an LLM taking this seat: role, doctrine, what the crew expects of it. */
    prompt?: string;
};

/** Station name to sandbox. Names are free-form — a bridge may name its seats whatever it likes. */
export type StationsManifest = {
    stations: Record<string, StationEntry>;
};

/**
 * True for a manifest entry that is a real, ship-bound crew seat: enabled, and not the `gm`
 * meta-seat. The station registry's auto-assign and self-assignment validation (`GameManager`)
 * key off this — the GM seat has no ship of its own, so it must never compete for one, even if
 * a future manifest change enables it (today it doesn't, but that's the wrong thing to rely on).
 */
export function isAssignableSeat(entry: StationEntry | undefined): boolean {
    return !!entry?.enabled && !entry.gm;
}

/**
 * A seat is what one player (or one bot) plays; a screen is what one client shows. A human may need
 * several clients for one seat. `bot` is the station a bot of this seat plays through: one of its
 * screens, or a fused station of the stations in `fuses`. A seat with no screens is bot-only.
 */
type SeatRow = { screens: readonly string[]; bot: string; fuses?: readonly string[] };

/** The seat table: the single source of which screens each bridge seat spans. */
export const bridgeSeats = {
    pilot: { screens: ['helms'], bot: 'helms' },
    weapons: { screens: ['weapons'], bot: 'weapons' },
    engineer: { screens: ['engineer'], bot: 'engineer' },
    sigint: { screens: ['signals', 'dradis', 'target-details'], bot: 'signals' },
    tactical: { screens: [], bot: 'tactical', fuses: ['helms', 'weapons'] },
} as const satisfies Record<string, SeatRow>;

/** A seat on a ship's bridge, taken by a human or a GM-assigned bot. */
export type BridgeSeat = keyof typeof bridgeSeats;

/** Seats the GM roster lists, in bridge order. */
export const rosterSeats = Object.keys(bridgeSeats) as BridgeSeat[];

/** True when `seat` names a row of the seat table. */
export function isBridgeSeat(seat: string): seat is BridgeSeat {
    return Object.hasOwn(bridgeSeats, seat);
}

/** The screens a seat spans. */
export function seatScreens(seat: BridgeSeat): readonly string[] {
    return bridgeSeats[seat].screens;
}

/** The roster seat a screen belongs to. */
export function seatOfScreen(screen: string): BridgeSeat | undefined {
    return rosterSeats.find((s) => seatScreens(s).includes(screen));
}

/** True when bots on both seats would play a station in common (`tactical` against `pilot` or `weapons`). */
export function botSeatsConflict(a: BridgeSeat, b: BridgeSeat): boolean {
    const played = (seat: BridgeSeat) => (bridgeSeats[seat] as SeatRow).fuses ?? [bridgeSeats[seat].bot];
    return a !== b && played(a).some((station) => played(b).includes(station));
}

/** Fused stations: seats whose bot plays several stations as one, keyed by the fused station. */
export const multiplexedStations: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
    Object.values(bridgeSeats as Record<string, SeatRow>).flatMap((row) => (row.fuses ? [[row.bot, row.fuses]] : [])),
);
