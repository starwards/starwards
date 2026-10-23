import { Display, Heard, ORDERS_PANEL, OrdersBoard, ordersSummary } from '@starwards/bots';
import { RecordedDecision, RecordedRequest, readDecisionLog } from '../training/decision-log';
import { RecordingEventLine, parseEventLine } from '@starwards/core/internal';
import { findSidecar, readSidecarLines } from '@starwards/server/src/recording/sidecar-file';

type XY = { x: number; y: number };
type Contact = {
    id: string;
    name?: string;
    distance: number;
    bearing: number;
    faction?: number;
    type?: string;
    radius?: number;
    position?: XY;
};
type Radar = { ownShip?: { faction?: number; position?: XY }; contacts?: Contact[] };

/** One recorded crew run, read back for branching: every request, decision and callout, and the order board over time. */
export type RunLog = {
    requests: RecordedRequest[];
    decisions: RecordedDecision[];
    callouts: { t: number; station: string; callout: string; phrase: string; delivered: boolean }[];
    boards: { t: number; board: OrdersBoard }[];
};

export function readRunLog(recordingPath: string): RunLog {
    const { requests, decisions } = readDecisionLog(recordingPath);
    const sidecar = findSidecar(recordingPath);
    if (!sidecar) throw new Error(`no events sidecar for ${recordingPath}`);
    const lines = readSidecarLines(sidecar)
        .map(parseEventLine)
        .filter((l): l is RecordingEventLine => l !== null && (l.kind === 'callout' || l.kind === 'orders'));
    return {
        requests,
        decisions,
        callouts: lines
            .filter((l) => l.kind === 'callout')
            .map((l) => ({ t: l.t, ...(l.data as Omit<RunLog['callouts'][number], 't'>) })),
        boards: lines.filter((l) => l.kind === 'orders').map((l) => ({ t: l.t, board: l.data as OrdersBoard })),
    };
}

/** The last request a station made at or before `t`. */
export function requestAt(log: RunLog, station: string, t: number) {
    let found: RecordedRequest | undefined;
    for (const r of log.requests) {
        if (r.station !== station) continue;
        if (r.t > t + 1e-9) break;
        found = r;
    }
    return found;
}

/** A station or a nebula the dradis shows. */
export type Landmark = { name?: string; distance: number; radius?: number; bearing: number; position?: XY };

/** What the crew knew at a branch point: the picture the captain had, the ship's state, and every order in force. */
export type StateSummary = {
    t: number;
    /** Identified enemy ships on the captain's dradis, and the nearest. */
    enemies: number;
    nearestEnemy?: { name?: string; distance: number; position?: XY };
    /** Every identified enemy, nearest first: target choices. */
    enemyNames: string[];
    /** Allied stations (dock hosts) and nebulae the dradis shows, nearest first. */
    stations: Landmark[];
    nebulae: Landmark[];
    /** Armor plates intact (helms), energy store share (engineer), docking mode (helms). */
    armor?: number;
    energy?: number;
    docking?: number;
    /** Every slot in force and the ranking, one line (`navigation=dock_for_repair:dock(docked) priorities=…`). */
    orders: string;
    board?: OrdersBoard;
    /** What a seat heard on the radio at its decision: the captain's latest phrases. */
    heard?: string[];
};

const STATION_RADIUS = 200;
const BODY_RADIUS = 2000;

/** The nearest identified enemy ship, every ally station and every nebula on a radar. */
function picture(radar: Radar | undefined) {
    const faction = radar?.ownShip?.faction;
    const contacts = radar?.contacts ?? [];
    const ships = contacts.filter((c) => c.type === 'Spaceship' && c.faction !== undefined);
    const enemies = ships.filter((c) => c.faction !== faction).sort((a, b) => a.distance - b.distance);
    const stations = ships
        .filter((c) => c.faction === faction && (c.radius ?? 0) >= STATION_RADIUS)
        .sort((a, b) => a.distance - b.distance);
    const nebulae = contacts
        .filter((c) => c.type !== 'Spaceship' && (c.radius ?? 0) >= BODY_RADIUS)
        .sort((a, b) => a.distance - b.distance);
    return { enemies, stations, nebulae };
}

const brief = (c: Contact) => ({
    name: c.name,
    distance: Math.round(c.distance),
    radius: c.radius,
    bearing: Math.round(c.bearing),
    position: c.position,
});

/** The state summary at `t`, from the latest captain, helms and engineer displays recorded by then. */
export function stateAt(log: RunLog, t: number, seat?: string): StateSummary {
    const captain = requestAt(log, 'captain', t);
    const helms = requestAt(log, 'helms', t);
    const engineer = requestAt(log, 'engineer', t);
    const { enemies, stations, nebulae } = picture(captain?.display.radar as Radar | undefined);
    const armor = helms?.display.panels['armor-status'] as
        { numberOfPlates?: number; healthyPlates?: number } | undefined;
    const eng = engineer?.display.panels['engineering-status'] as { energy?: number; maxEnergy?: number } | undefined;
    const board = boardAt(log, t, captain?.display);
    const own = seat ? requestAt(log, seat, t) : undefined;
    return {
        t,
        enemies: enemies.length,
        ...(enemies[0]
            ? {
                  nearestEnemy: {
                      name: enemies[0].name,
                      distance: Math.round(enemies[0].distance),
                      position: enemies[0].position,
                  },
              }
            : {}),
        enemyNames: enemies.flatMap((e) => (e.name ? [e.name] : [])),
        stations: stations.map(brief),
        nebulae: nebulae.map(brief),
        ...(armor?.numberOfPlates ? { armor: (armor.healthyPlates ?? 0) / armor.numberOfPlates } : {}),
        ...(eng?.maxEnergy ? { energy: (eng.energy ?? 0) / eng.maxEnergy } : {}),
        docking: (helms?.display.panels['docking-status'] as { mode?: number } | undefined)?.mode,
        orders: board ? ordersSummary(board) : 'none',
        ...(board ? { board } : {}),
        ...(own ? { heard: heardLines(own.heard) } : {}),
    };
}

/** The order board in force at `t`: the last one recorded, else the one a display showed. */
function boardAt(log: RunLog, t: number, display: Display | undefined) {
    let found = display?.panels[ORDERS_PANEL] as OrdersBoard | undefined;
    for (const b of log.boards) {
        if (b.t > t + 1e-9) break;
        found = b.board;
    }
    return found;
}

function heardLines(heard: Heard[] | undefined) {
    return (heard ?? []).map((h) => `${h.speaker}: ${h.phrase} (${Math.round(h.secondsAgo)} s ago)`);
}
