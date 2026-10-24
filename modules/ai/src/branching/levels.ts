import {
    Answer,
    BrainSpec,
    CALLOUT_QUESTION,
    Display,
    GivenOrder,
    MISSILE_MIN_LAUNCH_METERS,
    OrderCommand,
    OrdersBoard,
    Policy,
    SILENCE,
    SeatPlan,
    isEnemyShip,
    missileLaunchRange,
    orderCommand,
    orderFromCallout,
    readOrders,
    stationControls,
} from '@starwards/bots';
import { CREW_ORDER_KINDS, STANCES } from '@starwards/core/internal';
import { RunLog, StateSummary, requestAt, stateAt } from './run-log';

import { CrewOptions } from '../crew/crew';
import { HeadlessGame } from '@starwards/server/src/test/headless-game';

/** What a branch changes in the replayed run, from its branch point on. */
export type Intervention = {
    seats?: (seats: SeatPlan[]) => SeatPlan[];
    intervene?: CrewOptions['intervene'];
    lens?: CrewOptions['lens'];
    /** Test-only: acts on the game itself each tick (an oracle), outside the crew's consoles. */
    script?: (game: HeadlessGame) => void;
};

/** A decision worth replaying differently: when, why, what was decided there, and what the crew knew. */
export type BranchPoint = {
    level: LevelName;
    t: number;
    /** Why this moment: `order change`, `armor 0.75`, `enemy enters envelope`, `choice flip`. */
    reasons: string[];
    /** What the run did here: the order in force (or `keep`), the captain's callout, or a control's choice. */
    taken: string;
    /** Button level: the seat and control id. */
    seat?: string;
    control?: string;
    state: StateSummary;
};

/** One alternative at a branch point: its id (`dock_for_repair@dock`), the kind it varies, and how to play it. */
export type Alternative = { id: string; kind: string; intervention: Intervention };

export type LevelName = 'strategic' | 'tactical' | 'button';

/**
 * A level of decision a branch can vary: where its decisions are in a recorded run, and the
 * alternatives at each. Every level plugs into the same fork, corpus and mining.
 */
export type DecisionLevel = {
    name: LevelName;
    points(log: RunLog): BranchPoint[];
    alternatives(point: BranchPoint, log: RunLog): Alternative[];
};

/**
 * The simulated time, for a policy wrapper that acts from a branch point on: set from the crew's
 * `intervene` hook before every tick's decisions.
 */
function branchClock() {
    const clock = { now: 0 };
    return { clock, intervene: (seconds: number) => void (clock.now = seconds) };
}

/** Wraps one seat's policy so that, while `active(now)`, `override` rewrites its answers. */
function overrideSeat(
    station: string,
    clock: { now: number },
    active: (now: number) => boolean,
    override: (answers: Record<string, Answer>) => Record<string, Answer>,
    spec?: BrainSpec,
) {
    return (seats: SeatPlan[]) =>
        seats.map((seat): SeatPlan => {
            if (seat.station !== station) return seat;
            const inner = seat.policy;
            const policy: Policy = {
                name: inner.name,
                async answer(request, controls, display, heard) {
                    const result = await inner.answer(request, controls, display, heard);
                    return active(clock.now) ? { ...result, answers: override(result.answers) } : result;
                },
            };
            return { ...seat, ...(spec ? { spec } : {}), policy };
        });
}

// ---------------------------------------------------------------- strategic

/** Armor and energy shares whose crossing downward is a strategic moment. */
const ARMOR_MARKS = [0.75, 0.5, 0.25];
const ENERGY_MARKS = [0.3, 0.15];
/** The reference missile's launch envelope against a still target: the run log has no target motion. */
const STILL_TARGET_ENVELOPE = missileLaunchRange('HiExpMissile', 0);
/**
 * How long the branched captain leaves the ship docked once a dock order completes before ordering it
 * off: casting off is a captain's verbal order, and the reference captain has no rule for it.
 */
const UNDOCK_AFTER_SECONDS = 60;

function crossings(
    log: RunLog,
    station: string,
    read: (d: Display) => number | undefined,
    marks: number[],
    label: string,
) {
    const out: { t: number; reason: string }[] = [];
    let previous: number | undefined;
    for (const r of log.requests.filter((q) => q.station === station)) {
        const value = read(r.display);
        if (value === undefined) continue;
        for (const m of marks) {
            if (previous !== undefined && previous >= m && value < m) out.push({ t: r.t, reason: `${label} ${m}` });
        }
        previous = value;
    }
    return out;
}

const armorShare = (d: Display) => {
    const a = d.panels['armor-status'] as { numberOfPlates?: number; healthyPlates?: number } | undefined;
    return a?.numberOfPlates ? (a.healthyPlates ?? 0) / a.numberOfPlates : undefined;
};
const energyShare = (d: Display) => {
    const e = d.panels['engineering-status'] as { energy?: number; maxEnergy?: number } | undefined;
    return e?.maxEnergy ? (e.energy ?? 0) / e.maxEnergy : undefined;
};

/** Captain decisions at which the count of enemies in sight changes: first contact, a kill, a target lost. */
function enemyCountChanges(log: RunLog) {
    const out: { t: number; reason: string }[] = [];
    let previous = 0;
    for (const r of log.requests.filter((q) => q.station === 'captain')) {
        const n = stateAt(log, r.t).enemies;
        if (n > previous) out.push({ t: r.t, reason: previous === 0 ? 'enemy in sight' : 'enemy appears' });
        if (n < previous) out.push({ t: r.t, reason: n === 0 ? 'no enemy in sight' : 'enemy lost' });
        previous = n;
    }
    return out;
}

/** Groups moments within `window` seconds into one point at the first of them. */
function group(moments: { t: number; reason: string }[], window = 2) {
    const sorted = [...moments].sort((a, b) => a.t - b.t);
    const groups: { t: number; reasons: string[] }[] = [];
    for (const m of sorted) {
        const last = groups[groups.length - 1];
        if (last && m.t - last.t <= window) {
            if (!last.reasons.includes(m.reason)) last.reasons.push(m.reason);
        } else groups.push({ t: m.t, reasons: [m.reason] });
    }
    return groups;
}

/**
 * The branched captain does not call an order that contradicts one it gave at the branch point (a
 * reference captain calling `close_to` every decision would otherwise cancel a `hold_position` at once):
 * such a call becomes silence while the branch's order stands on the board, or is sent and not yet on it.
 */
function keepToBranchOrders(seats: SeatPlan[], inFlight: () => string | undefined) {
    return seats.map((seat): SeatPlan => {
        if (seat.station !== 'captain') return seat;
        const inner = seat.policy;
        return {
            ...seat,
            policy: {
                name: inner.name,
                async answer(request, controls, display, heard) {
                    const result = await inner.answer(request, controls, display, heard);
                    const call = result.answers[CALLOUT_QUESTION]?.choice;
                    const kind = call && orderFromCallout(call, {}, undefined)?.kind;
                    const standing = readOrders(display)
                        .orders.filter((o) => o.issuer === 'captain' && o.origin === 'branch' && o.status === 'active')
                        .map((o) => o.kind);
                    const sent = inFlight();
                    if (sent) standing.push(sent);
                    const contradicts = (a: string, b: string) =>
                        CREW_ORDER_KINDS[a]?.contradicts?.includes(b) === true;
                    return kind && standing.some((o) => contradicts(kind, o) || contradicts(o, kind))
                        ? {
                              ...result,
                              answers: { ...result.answers, [CALLOUT_QUESTION]: { choice: SILENCE, source: 'rule' } },
                          }
                        : result;
                },
            },
        };
    });
}

/**
 * Gives one order to the crew's order state at the first tick at or after `t`; from then on the
 * branched captain also orders the ship off a dock `UNDOCK_AFTER_SECONDS` after a dock order completes
 * (the order itself, or one a standing order started).
 */
function giveAt(t: number, order: GivenOrder): Intervention {
    let given = false;
    /** The branch order sent and not yet on the board: commands land at the ship's next update. */
    let inFlight: string | undefined;
    return {
        seats: (seats) => keepToBranchOrders(seats, () => inFlight),
        intervene: (seconds: number, board: OrdersBoard | undefined, send: (c: OrderCommand) => void) => {
            if (board?.orders.some((o) => o.origin === 'branch' && o.kind === inFlight)) inFlight = undefined;
            const give = (o: GivenOrder) => {
                const c = orderCommand(o, 'captain', 'branch');
                if (c) send(c);
                inFlight = o.kind;
            };
            if (!given && seconds + 1e-9 >= t) {
                given = true;
                give(order);
            }
            const docked = board?.orders.find((o) => o.slot === 'navigation');
            if (
                given &&
                docked?.kind === 'dock_for_repair' &&
                docked.status === 'complete' &&
                seconds - (docked.stepAt ?? seconds) >= UNDOCK_AFTER_SECONDS
            ) {
                give({ kind: 'undock' });
            }
        },
    };
}

/**
 * Mission priority: what the ship is for right now (dock for repair, retreat, hold position, patrol,
 * preserve energy, a standing dock order), revoking a strategic slot, or a stance (which sets the slot
 * ranking and its own button-level rules). A branch changes one slot of the order state at its point;
 * every other slot keeps its order, and the tactical play that follows is the reference's under the new state.
 */
export const strategicLevel: DecisionLevel = {
    name: 'strategic',
    points(log) {
        const firstSight = enemyCountChanges(log);
        const moments = [
            ...firstSight,
            ...crossings(log, 'helms', armorShare, ARMOR_MARKS, 'armor'),
            ...crossings(log, 'engineer', energyShare, ENERGY_MARKS, 'energy'),
        ];
        return group(moments).map(({ t, reasons }) => {
            const state = stateAt(log, t);
            return { level: 'strategic', t, reasons, taken: 'keep', state };
        });
    },
    alternatives({ t, state }) {
        const alts: Alternative[] = [];
        const active = new Map((state.board?.orders ?? []).map((o) => [o.slot, o]));
        const add = (id: string, kind: string, order: GivenOrder) =>
            alts.push({ id, kind, intervention: giveAt(t, order) });
        const enemy = state.nearestEnemy;
        for (const s of state.stations.slice(0, 2)) {
            if (!s.position) continue;
            const station = { name: s.name, position: s.position, radius: s.radius };
            if (active.get('navigation')?.kind !== 'dock_for_repair') {
                add(`dock_for_repair@${s.name}`, 'dock_for_repair', { kind: 'dock_for_repair', params: { station } });
            }
            if (!active.has('repair')) {
                add(`dock_below_armor@${s.name}`, 'dock_below_armor', {
                    kind: 'dock_below_armor',
                    params: { station, threshold: 0.5 },
                });
            }
        }
        if (enemy?.position && active.get('navigation')?.kind !== 'retreat') {
            add(`retreat@${enemy.name}`, 'retreat', {
                kind: 'retreat',
                params: { target: { name: enemy.name, position: enemy.position } },
            });
        }
        if (active.get('navigation')?.kind !== 'hold_position') {
            add('hold_position', 'hold_position', { kind: 'hold_position' });
        }
        for (const n of state.nebulae.slice(0, 2)) {
            if (!n.position) continue;
            add(`patrol@${n.name}`, 'patrol', {
                kind: 'patrol',
                params: {
                    region: {
                        name: n.name,
                        position: n.position,
                        radius: n.radius,
                        ...(enemy?.position ? { from: { name: enemy.name, position: enemy.position } } : {}),
                    },
                },
            });
        }
        if (!active.has('energy')) add('preserve_energy', 'preserve_energy', { kind: 'preserve_energy' });
        for (const slot of ['navigation', 'energy', 'repair'] as const) {
            if (active.has(slot)) add(`revoke:${slot}`, 'revoke', { kind: 'revoke', params: { slot } });
        }
        // a stance sets the slot ranking and its own button-level rules
        for (const stance of STANCES) {
            if (active.get('stance')?.kind !== stance) add(`stance:${stance}`, `stance:${stance}`, { kind: stance });
        }
        return alts;
    },
};

// ---------------------------------------------------------------- tactical

/** The captain's maneuver and engagement orders a tactical branch may say instead. */
const TACTICAL_ORDERS = ['close_to', 'engage', 'hold_here', 'chase_target'] as const;
/** Orders that need an enemy on the dradis to name. */
const NEEDS_ENEMY = new Set(['close_to', 'engage', 'chase_target']);

/** How long a tactical branch holds the captain to its alternative before the reference captain resumes. */
let tacticalWindowSeconds = 30;
export function setTacticalWindow(seconds: number) {
    tacticalWindowSeconds = seconds;
}

/**
 * The captain's tactical calls: close to, engage, hold here, chase, and which enemy. A branch has the
 * captain say the alternative at every decision for a commit window (the reference captain would
 * otherwise supersede it at its next decision), then the reference captain resumes. The alternative
 * reaches the order state and the radio exactly as a captain's own call does.
 */
export function tacticalLevel(captainSpec?: BrainSpec): DecisionLevel {
    return {
        name: 'tactical',
        points(log) {
            const moments: { t: number; reason: string }[] = [];
            let previousCall: string | undefined;
            let previousDistance: number | undefined;
            let previousPlates: number | undefined;
            for (const d of log.decisions.filter((x) => x.station === 'captain' && x.control === CALLOUT_QUESTION)) {
                if (d.choice !== 'silence' && d.choice !== previousCall) {
                    moments.push({ t: d.t, reason: previousCall === undefined ? 'first order' : 'order change' });
                    previousCall = d.choice;
                }
                const distance = stateAt(log, d.t).nearestEnemy?.distance;
                if (distance !== undefined && previousDistance !== undefined) {
                    const inEnvelope = (x: number) => x >= MISSILE_MIN_LAUNCH_METERS && x <= STILL_TARGET_ENVELOPE;
                    if (inEnvelope(distance) && !inEnvelope(previousDistance))
                        moments.push({ t: d.t, reason: 'enemy enters envelope' });
                    if (!inEnvelope(distance) && inEnvelope(previousDistance))
                        moments.push({ t: d.t, reason: 'enemy leaves envelope' });
                }
                previousDistance = distance;
                const helms = requestAt(log, 'helms', d.t);
                const plates = (helms?.display.panels['armor-status'] as { healthyPlates?: number } | undefined)
                    ?.healthyPlates;
                if (plates !== undefined && previousPlates !== undefined && plates < previousPlates) {
                    moments.push({ t: d.t, reason: 'armor hit' });
                }
                previousPlates = plates;
            }
            for (const m of enemyCountChanges(log)) moments.push(m);
            // a captain acts only at its decisions: snap every moment to the next one
            const decisionsAt = log.decisions
                .filter((x) => x.station === 'captain' && x.control === CALLOUT_QUESTION)
                .map((x) => x.t);
            const snapped = moments.flatMap((m) => {
                const at = decisionsAt.find((t) => t + 1e-9 >= m.t);
                return at === undefined ? [] : [{ t: at, reason: m.reason }];
            });
            return group(snapped, 0.5).map(({ t, reasons }) => ({
                level: 'tactical' as const,
                t,
                reasons,
                taken:
                    log.decisions.find((x) => x.station === 'captain' && x.control === CALLOUT_QUESTION && x.t === t)
                        ?.choice ?? 'silence',
                state: stateAt(log, t),
            }));
        },
        alternatives({ t, taken, state }, log) {
            const window = tacticalWindowSeconds;
            // without a captain brain to swap in, only the calls the recorded captain's brain can say
            const asked = requestAt(log, 'captain', t) as
                { questions?: Record<string, { criteria?: object }> } | undefined;
            const sayable = new Set(
                captainSpec ? TACTICAL_ORDERS : Object.keys(asked?.questions?.[CALLOUT_QUESTION]?.criteria ?? {}),
            );
            const say = (call: string, only?: string): Intervention => {
                const { clock, intervene } = branchClock();
                const active = (now: number) => now + 1e-9 >= t && now < t + window;
                return {
                    intervene,
                    seats: overrideSeat(
                        'captain',
                        clock,
                        active,
                        (answers) => ({ ...answers, [CALLOUT_QUESTION]: { choice: call, source: 'rule' } }),
                        captainSpec,
                    ),
                    ...(only
                        ? {
                              // the captain sees only the chosen enemy while the call holds, so the call names it
                              lens: {
                                  captain: (display: Display, seconds: number) =>
                                      active(seconds) ? onlyEnemy(display, only) : display,
                              },
                          }
                        : {}),
                };
            };
            const alts: Alternative[] = [];
            for (const call of TACTICAL_ORDERS) {
                if (call === taken || !sayable.has(call) || (NEEDS_ENEMY.has(call) && !state.nearestEnemy)) continue;
                alts.push({ id: call, kind: call, intervention: say(call) });
            }
            for (const name of state.enemyNames.slice(1)) {
                alts.push({ id: `engage@${name}`, kind: 'engage_other', intervention: say('engage', name) });
            }
            return alts;
        },
    };
}

type Radar = { ownShip?: { faction?: number }; contacts?: { name?: string; faction?: number; type?: string }[] };

function onlyEnemy(display: Display, name: string): Display {
    const radar = display.radar as Radar | undefined;
    if (!radar?.contacts) return display;
    const faction = radar.ownShip?.faction;
    return {
        ...display,
        radar: {
            ...radar,
            contacts: radar.contacts.filter((c) => !(isEnemyShip(c, faction) && c.name !== name)),
        },
    };
}

// ---------------------------------------------------------------- button

/**
 * One seat control at one decision: the existing button-level tools (`decisions` for where a control
 * flips, `reask` for what another brain would press there) as a level. Its branch points are the
 * decisions where the control's choice changed; its alternatives are that control's other options
 * there (and, given a `reask` answer, the brain's choice), each pressed for `windowSeconds`. The order
 * board the seat read at that decision is in the point's state.
 */
export function buttonLevel(
    station: string,
    control: string,
    { windowSeconds = 0, reaskChoices }: { windowSeconds?: number; reaskChoices?: Map<number, string> } = {},
): DecisionLevel {
    return {
        name: 'button',
        points(log) {
            const mine = log.decisions.filter(
                (d) => d.station === station && (d.control === control || d.control.startsWith(`${control}:`)),
            );
            const points: BranchPoint[] = [];
            const last = new Map<string, string>();
            for (const d of mine) {
                const before = last.get(d.control);
                last.set(d.control, d.choice);
                if (before === undefined || before === d.choice) continue;
                points.push({
                    level: 'button',
                    t: d.t,
                    reasons: [`${d.control} ${before}→${d.choice}`],
                    taken: d.choice,
                    seat: station,
                    control: d.control,
                    state: stateAt(log, d.t, station),
                });
            }
            return points;
        },
        alternatives(point, log) {
            const request = log.requests.find((r) => r.station === station && Math.abs(r.t - point.t) < 1e-9);
            if (!request || !point.control) return [];
            const controls = stationControls({
                display: request.display,
                capabilities: request.capabilities,
                burstSeconds: 1,
            });
            const options = Object.keys(controls.find((c) => c.id === point.control)?.options ?? {});
            const asked = reaskChoices?.get(point.t);
            const choices = [...new Set([...(asked ? [asked] : []), ...options])].filter((o) => o !== point.taken);
            return choices.map((choice) => {
                const { clock, intervene } = branchClock();
                const until = point.t + Math.max(windowSeconds, 1e-6);
                return {
                    id: `${point.control}=${choice}${choice === asked ? ' (reask)' : ''}`,
                    kind: choice,
                    intervention: {
                        intervene,
                        seats: overrideSeat(
                            station,
                            clock,
                            (now) => now + 1e-9 >= point.t && now < until + 1e-9,
                            (answers) => ({ ...answers, [point.control!]: { choice, source: 'rule' } }),
                        ),
                    },
                };
            });
        },
    };
}
