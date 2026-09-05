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
    'pilot-radar',
    'tactical-radar',
    'long-range-radar',
    'relay-radar',
    'pilot-stats',
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
export const stationRadarWidgets = ['tactical-radar', 'pilot-radar', 'long-range-radar', 'relay-radar'] as const;

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
    // pilot
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
    'fireChainGun',
    'loadChainGun',
    'changeGunAmmo',
    // engineering
    'systemPower',
    'systemCoolant',
    'warpFrequency',
    'changeFrequency',
    'enqueueRepair',
    'cancelRepair',
    'reorderRepair',
    // signals
    'beamDirection',
    'beamArc',
    'pauseJobs',
    'prioritizeJob',
    'cancelJob',
    // relay
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
