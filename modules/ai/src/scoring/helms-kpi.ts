import { DockingMode, RecordingEventLine, SavedGame, XY, isShellAmmo } from '@starwards/core/internal';
import { observeTactical, shellReaches } from './weapons-kpi';

import { integrity } from './features';
import { offNose } from '../brain/verbal';

/**
 * The helms score: how well the ship is flown, from what the helms seat controls (position, heading,
 * speed, flight mode and commands, warp level), read from a recording (1 s `SavedGame` frames and the
 * `.events.jsonl` sidecar) and from ground truth. It is a training and evaluation heuristic, not an
 * in-seat indicator: it reads hostiles' armament and rounds the seat cannot see.
 *
 * Per frame t, a set of terms. Each term `i` has a demand `d_i` in [0, 1] (how much the situation asks
 * of the helm in that respect) and a score `s_i` in [0, 1]. The frame's score is the demand-weighted
 * mean `P = Σ w_i·d_i·s_i / Σ w_i·d_i`; a term with no demand adds nothing to either sum, and a frame
 * where no term has demand has no score (`null`), never a score of 0 or 1.
 *
 * - `position` (offence): the helm's share of the firing solution, against the weapons-locked hostile,
 *   else the nearest one. Demand 1 while the ship's weapons could fire. `s = band(distance)·aim`: the
 *   gun band (500 m to `bandHigh`) is 1, short of it `d/500`, beyond it decaying over
 *   `bandDecay`; `aim` is 1 while the nose line passes within {@link AIM_HALF_WIDTH} of the
 *   target, then decays. A standoff is not judged: where the ship parks is rated by the band alone.
 *
 * - `evasion`: damage avoided under fire. Of the hostile rounds fired in the last {@link EVASION_WINDOW}
 *   seconds that would have hit the ship had it kept the velocity it had when they were fired, the share
 *   that did not hit it; a hit by a round that was not on course counts as a hit. Demand grows with the
 *   number of such rounds (`n / (n + fireHalf)`), so a ship nobody shoots at has no demand. Weave
 *   frequency is not scored.
 * - `collision`: unintended collisions. Demand 1 while something that can be hit (any other ship, asteroid
 *   or derelict) is on course to touch the hull within {@link COLLISION_HORIZON} seconds at the velocities
 *   of the frame (or touching it), and in any frame a collision follows. `s = 0` if the ship took collision
 *   damage in the next {@link COLLISION_WINDOW} seconds, else 1. Docking is not scored: collisions while a
 *   docking mode is set are ignored. A hostile rammed on purpose is not told apart from one run into.
 * - `waypoint`: course execution. Demand 1 while a waypoint of the ship's faction exists and no hostile
 *   has the ship's attention (none within {@link ENGAGED_RANGE}); `s` is how fast the ship closes on it
 *   (a share of {@link WAYPOINT_SPEED}), 1 within {@link WAYPOINT_ARRIVED}.
 * - `warp`: the warp level the helm holds. Demand 1 while a warp level is set and a hostile is within
 *   {@link ENGAGED_RANGE}, with `s = 0`: with nothing engaged the helm is asked nothing, and a score of 1 would be
 *   a gift. The frequency is the engineer's and is not scored.
 *
 * Not in the score, by design: a thrust shortfall from power (the engineer's), the pilot's reading of
 * verbal orders (the sidecar holds none), and docking.
 */
/** The position term's geometry (metres, except the margin): defaults are {@link HELMS_SHAPE}. */
export interface HelmsShape {
    readonly bandHigh: number;
    readonly bandDecay: number;
    readonly aimDecay: number;
}

export interface HelmsWeights {
    readonly position: number;
    readonly evasion: number;
    readonly collision: number;
    readonly waypoint: number;
    readonly warp: number;
    /** Hostile rounds in the evasion window at which the evasion term has half its demand. */
    readonly fireHalf: number;
}

/** Equal weights by design. Only `evasion` and `fireHalf` are open to fitting (see the report). */
export const HELMS_WEIGHTS: HelmsWeights = {
    position: 1,
    evasion: 1,
    collision: 1,
    waypoint: 1,
    warp: 1,
    fireHalf: 30,
};

/** Set by design; the validation report tests none of them against alternatives except where it says so. */
export const HELMS_SHAPE: HelmsShape = {
    bandHigh: 3000,
    bandDecay: 3000,
    aimDecay: 400,
};

/** Gun band, metres: the forward chain gun reaches the target (as `features.ts` `GUN_BAND_METERS`). */
const BAND_LOW = 500;
/** Lateral miss within which the nose line counts as aimed (the HE blast, as `inFiringPosition`), metres. */
const AIM_HALF_WIDTH = 100;
const EVASION_WINDOW = 20;
/** Seconds after a frame in which a collision counts against it. */
const COLLISION_WINDOW = 10;
/** Seconds ahead in which a body on course to touch the hull asks for avoidance, and the clearance counted as touching, metres. */
const COLLISION_HORIZON = 20;
const COLLISION_CLEARANCE = 100;
/** A hostile this close (metres) is an engagement: no warp, no waypoint course. */
const ENGAGED_RANGE = 8000;
const WAYPOINT_SPEED = 300;
const WAYPOINT_ARRIVED = 500;
/** Seconds a shot's shell may take to land after its fuse, for matching hits to rounds. */
const HIT_SLACK = 1.5;
const MIN_DEMAND = 1e-6;

/** A body that can be run into, with its velocity. */
export interface Body {
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
    readonly radius: number;
}

export interface HelmsHostile {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
    readonly radius: number;
}

/** What one frame shows, before windows over neighbouring frames and events. */
export interface HelmsObservation {
    readonly t: number;
    readonly own: {
        readonly x: number;
        readonly y: number;
        readonly vx: number;
        readonly vy: number;
        readonly radius: number;
        readonly angle: number;
        readonly integrity: number;
        /** Weapons could fire: a working gun with a shell, or a missile ready. */
        readonly canFire: boolean;
    };
    readonly hostiles: readonly HelmsHostile[];
    readonly lockedId: string | null;
    /** Everything but a hostile that can be run into: other ships, asteroids, derelicts. */
    readonly obstacles: readonly Body[];
    readonly docking: boolean;
    readonly waypoint: { readonly x: number; readonly y: number } | null;
    readonly warpLevel: number;
}

/** Reads one frame for the player ship `playerId`; `undefined` when it is gone. */
export function observeHelms(t: number, saved: SavedGame, playerId: string): HelmsObservation | undefined {
    const ship = saved.fragment.ship.get(playerId);
    const body = saved.fragment.space.getShip(playerId);
    if (!ship || !body || body.destroyed) return undefined;
    const hostiles: HelmsHostile[] = [];
    const obstacles: Body[] = [];
    for (const other of saved.fragment.space.getAll('Spaceship')) {
        if (other.id === playerId || other.destroyed) continue;
        const where = {
            x: other.position.x,
            y: other.position.y,
            vx: other.velocity.x,
            vy: other.velocity.y,
            radius: other.radius,
        };
        if (other.faction === body.faction) {
            obstacles.push(where);
        } else {
            hostiles.push({ id: other.id, ...where });
        }
    }
    for (const kind of ['Asteroid', 'Derelict'] as const) {
        for (const o of saved.fragment.space.getAll(kind)) {
            if (!o.destroyed) {
                obstacles.push({
                    x: o.position.x,
                    y: o.position.y,
                    vx: o.velocity.x,
                    vy: o.velocity.y,
                    radius: o.radius,
                });
            }
        }
    }
    let waypoint: HelmsObservation['waypoint'] = null;
    for (const w of saved.fragment.space.getAll('Waypoint')) {
        if (w.faction === body.faction && (!w.owner || w.owner === playerId)) {
            waypoint = { x: w.position.x, y: w.position.y };
            break;
        }
    }
    const tactical = observeTactical(t, saved, playerId);
    const canFire =
        !!tactical &&
        ((tactical.weapons.gun > 0 && tactical.weapons.shellsInMagazine.length > 0) || tactical.weapons.tubesReady);
    return {
        t,
        own: {
            x: body.position.x,
            y: body.position.y,
            vx: body.velocity.x,
            vy: body.velocity.y,
            radius: body.radius,
            angle: body.angle,
            integrity: integrity(ship),
            canFire,
        },
        hostiles,
        lockedId: ship.weaponsTarget?.targetId || null,
        obstacles,
        docking: !!ship.docking && ship.docking.mode !== DockingMode.UNDOCKED,
        waypoint,
        warpLevel: Math.max(ship.warp?.desiredLevel ?? 0, ship.warp?.currentLevel ?? 0),
    };
}

/** The hostile the ship is positioned against: the weapons-locked one, else the nearest. */
export function chosenTarget(o: HelmsObservation): HelmsHostile | undefined {
    const locked = o.hostiles.find((h) => h.id === o.lockedId);
    if (locked) return locked;
    const dist = (h: HelmsHostile) => Math.hypot(h.x - o.own.x, h.y - o.own.y);
    return [...o.hostiles].sort((a, b) => dist(a) - dist(b))[0];
}

export interface Term {
    /** Demand in [0, 1]. */
    readonly d: number;
    /** Score in [0, 1]; meaningless where `d` is 0. */
    readonly s: number;
}

export const TERMS = ['position', 'evasion', 'collision', 'waypoint', 'warp'] as const;
export type TermName = (typeof TERMS)[number];

/** Weight-free per-frame terms of the score, plus the quantities the report conditions on. */
export interface HelmsComponents {
    readonly t: number;
    readonly terms: Record<TermName, Term>;
    readonly distance: number | null;
    readonly integrity: number;
    /** Hostile rounds on course in the evasion window, and how many of them hit. */
    readonly onCourse: number;
    readonly hits: number;
}

const NONE: Term = { d: 0, s: 0 };
const clip01 = (v: number) => Math.min(1, Math.max(0, v));

/** The evasion term from the hostile rounds on course in the window and how many of them hit. */
function evasionTerm(onCourse: number, hits: number, fireHalf: number): Term {
    return onCourse ? { d: onCourse / (onCourse + fireHalf), s: 1 - hits / onCourse } : NONE;
}

/** The terms of a frame under `w`: the evasion term's demand depends on `w.fireHalf`. */
export function termsOf(c: HelmsComponents, w: HelmsWeights): Record<TermName, Term> {
    return { ...c.terms, evasion: evasionTerm(c.onCourse, c.hits, w.fireHalf) };
}

/** The position term for one frame (see the file's header). */
export function positionTerm(
    o: HelmsObservation,
    shape: HelmsShape = HELMS_SHAPE,
): { term: Term; distance: number | null } {
    const target = chosenTarget(o);
    if (!target || !o.own.canFire) return { term: NONE, distance: null };
    const sight = XY.difference({ x: target.x, y: target.y }, { x: o.own.x, y: o.own.y });
    const distance = XY.lengthOf(sight);
    const off = Math.abs(offNose(XY.angleOf(sight), o.own.angle));
    const miss = off >= 90 ? distance : distance * Math.sin((off * Math.PI) / 180);
    const high = shape.bandHigh;
    const band =
        distance < BAND_LOW
            ? distance / BAND_LOW
            : distance <= high
              ? 1
              : Math.exp(-(distance - high) / shape.bandDecay);
    const aim = miss <= AIM_HALF_WIDTH ? 1 : Math.exp(-(miss - AIM_HALF_WIDTH) / shape.aimDecay);
    return { term: { d: 1, s: band * aim }, distance };
}

const nearestGap = (o: HelmsObservation, things: readonly Body[]) =>
    Math.min(Infinity, ...things.map((h) => Math.hypot(h.x - o.own.x, h.y - o.own.y) - h.radius - o.own.radius));

/** Whether `b` touches the hull now, or does within {@link COLLISION_HORIZON} seconds at the frame's velocities. */
function onCollisionCourse(o: HelmsObservation, b: Body) {
    const rx = b.x - o.own.x;
    const ry = b.y - o.own.y;
    const vx = b.vx - o.own.vx;
    const vy = b.vy - o.own.vy;
    const reach = b.radius + o.own.radius + COLLISION_CLEARANCE;
    const speed2 = vx * vx + vy * vy;
    const tca = speed2 > 1e-9 ? Math.min(COLLISION_HORIZON, Math.max(0, -(rx * vx + ry * vy) / speed2)) : 0;
    return Math.hypot(rx + vx * tca, ry + vy * tca) <= reach;
}

/** The collision, waypoint and warp terms for one frame; `collided` is whether collision damage lands in its window. */
export function situationTerms(
    o: HelmsObservation,
    collided: boolean,
): Pick<Record<TermName, Term>, 'collision' | 'waypoint' | 'warp'> {
    const gapToHostile = nearestGap(o, o.hostiles);
    const engaged = gapToHostile <= ENGAGED_RANGE;
    const onCourse = [...o.obstacles, ...o.hostiles].some((b) => onCollisionCourse(o, b));
    let waypoint = NONE;
    if (o.waypoint && !engaged) {
        const to = XY.difference(o.waypoint, { x: o.own.x, y: o.own.y });
        const away = XY.lengthOf(to);
        const closing = away > 0 ? (o.own.vx * to.x + o.own.vy * to.y) / away : 0;
        waypoint = { d: 1, s: away <= WAYPOINT_ARRIVED ? 1 : clip01(closing / WAYPOINT_SPEED) };
    }
    return {
        collision: (onCourse || collided) && !o.docking ? { d: 1, s: collided ? 0 : 1 } : NONE,
        waypoint,
        warp: o.warpLevel > 0 && engaged ? { d: 1, s: 0 } : NONE,
    };
}

interface Round {
    readonly t: number;
    readonly ttl: number;
    readonly onCourse: boolean;
    hit: boolean;
}

/**
 * Hostile rounds as the evasion term reads them: each shell fired by a hostile that would have reached the
 * ship had it kept the velocity of the frame it was fired in, with whether a hit landed in its flight; then
 * each hit no round accounts for, as a round that hit.
 */
export function hostileRounds(
    observations: readonly HelmsObservation[],
    events: readonly RecordingEventLine[],
    playerId: string,
): Round[] {
    if (!observations.length) return [];
    const hostileIds = new Set(observations.flatMap((o) => o.hostiles.map((h) => h.id)));
    const frameAt = (t: number) => {
        let lo = 0;
        let hi = observations.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (observations[mid].t <= t) lo = mid;
            else hi = mid - 1;
        }
        return observations[lo];
    };
    const rounds: Round[] = [];
    for (const e of events) {
        if (e.kind !== 'shot') continue;
        const d = e.data as { shipId: string; ammo: string; x: number; y: number; vx: number; vy: number; ttl: number };
        if (!hostileIds.has(d.shipId) || !isShellAmmo(d.ammo as never)) continue;
        const f = frameAt(e.t);
        const dt = e.t - f.t;
        const own = {
            x: f.own.x + f.own.vx * dt,
            y: f.own.y + f.own.vy * dt,
            vx: f.own.vx,
            vy: f.own.vy,
            radius: f.own.radius,
        };
        rounds.push({ t: e.t, ttl: d.ttl, onCourse: shellReaches(d, d.ttl, d.ammo as never, own), hit: false });
    }
    const hits = events
        .filter((e) => {
            if (e.objectId !== playerId) return false;
            if (e.kind === 'blast_hit') return true;
            const d = e.data as { damageType?: string; delivery?: string; shooterId?: string };
            return e.kind === 'damage' && d.delivery === 'impact' && d.damageType !== 'Collision' && !!d.shooterId;
        })
        .map((e) => e.t)
        .sort((a, b) => a - b);
    const onCourse = rounds.filter((r) => r.onCourse).sort((a, b) => a.t - b.t);
    for (const h of hits) {
        const round = onCourse.find((r) => !r.hit && r.t <= h && h <= r.t + r.ttl + HIT_SLACK);
        if (round) round.hit = true;
        else rounds.push({ t: h, ttl: 0, onCourse: true, hit: true });
    }
    return rounds;
}

/** Weight-free components of every frame of a run, with rounds, hits and collisions from the sidecar. */
export function helmsComponents(
    observations: readonly HelmsObservation[],
    events: readonly RecordingEventLine[],
    playerId: string,
    shape: HelmsShape = HELMS_SHAPE,
): HelmsComponents[] {
    const rounds = hostileRounds(observations, events, playerId).filter((r) => r.onCourse);
    const collisions = events
        .filter(
            (e) =>
                e.kind === 'damage' &&
                e.objectId === playerId &&
                (e.data as { damageType?: string }).damageType === 'Collision',
        )
        .map((e) => e.t);
    return observations.map((o) => {
        const position = positionTerm(o, shape);
        const recent = rounds.filter((r) => r.t > o.t - EVASION_WINDOW && r.t <= o.t);
        const hits = recent.filter((r) => r.hit).length;
        const n = recent.length;
        const collided = collisions.some((c) => c > o.t && c <= o.t + COLLISION_WINDOW);
        return {
            t: o.t,
            terms: {
                position: position.term,
                evasion: evasionTerm(n, hits, HELMS_WEIGHTS.fireHalf),
                ...situationTerms(o, collided),
            },
            distance: position.distance,
            integrity: o.own.integrity,
            onCourse: n,
            hits,
        };
    });
}

/** The score of one frame, `null` when no term has demand. */
export function helmsScoreOf(c: HelmsComponents, w: HelmsWeights = HELMS_WEIGHTS): number | null {
    let num = 0;
    let den = 0;
    const terms = termsOf(c, w);
    for (const name of TERMS) {
        const { d, s } = terms[name];
        num += w[name] * d * s;
        den += w[name] * d;
    }
    return den > MIN_DEMAND ? num / den : null;
}

const HELMS_HORIZON = 30;

/**
 * `helms_score30` of every frame: the demand-weighted mean of the terms over (t, t+30 s], `null` when the
 * run ends before t+30 s or nothing was demanded in the window.
 */
export function helmsScore30(cs: readonly HelmsComponents[], w: HelmsWeights = HELMS_WEIGHTS): (number | null)[] {
    const end = cs.at(-1)?.t ?? 0;
    return cs.map((c, i) => {
        if (end < c.t + HELMS_HORIZON - 1e-6) return null;
        let num = 0;
        let den = 0;
        for (let j = i + 1; j < cs.length && cs[j].t <= c.t + HELMS_HORIZON + 1e-6; j++) {
            const terms = termsOf(cs[j], w);
            for (const name of TERMS) {
                const { d, s } = terms[name];
                num += w[name] * d * s;
                den += w[name] * d;
            }
        }
        return den > MIN_DEMAND ? num / den : null;
    });
}
