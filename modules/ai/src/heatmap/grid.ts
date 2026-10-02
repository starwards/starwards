import { ShipDirection, ShipState, Spaceship, XY } from '@starwards/core/internal';

import { offNose } from '../brain/verbal';

/**
 * Isochrone grid around a ship: sectors around the nose × bands of time-to-reach (not distance).
 * Deterministic, computed from one frame; every point in space falls in exactly one cell (the last
 * band is open-ended). Labels and models must use the grid as computed at the snapshot time.
 *
 * Time-to-reach is the reachable-set bound of a point mass with bounded thrust, two ways, whichever
 * is sooner:
 * - thrust now: the reachable set after `T` seconds is the disc around the drift point `v·T` with
 *   radius `r(T)` (`½·A·T²`, linear past top speed), `A` the thrust the ship can put along the needed
 *   direction with its current heading (boost and strafe thrusters clamp independently);
 * - turn first: rotate the nose onto the point (stop the current turn, then a bang-bang turn under
 *   `rotationCapacity` and `maxTurnSpeed`), then the same disc with forward thrust, drifting meanwhile.
 * Lateral drift, heading and turn rate are therefore in; afterburner, armour mass and pilot skill are
 * not. It is a lower bound on a perfect pilot's time; `validate.ts` measures it against how long the
 * GVTS really took to reach points in recorded runs.
 */

export const SECTORS = 8;
/** Upper edges of the time bands, seconds; the last band is everything beyond. */
export const BAND_EDGES: readonly number[] = [5, 15, 40];
export const BANDS = BAND_EDGES.length + 1;
export const CELLS = SECTORS * BANDS;
export const BAND_NAMES: readonly string[] = ['<5 s', '5–15 s', '15–40 s', '>40 s'];
/** Sector names, clockwise from the nose; "right" is positive off-nose, as the verbal UI reads it. */
export const SECTOR_NAMES: readonly string[] = [
    'ahead',
    'ahead-right',
    'right',
    'behind-right',
    'behind',
    'behind-left',
    'left',
    'ahead-left',
];
/** Representative time of each band, used to place a cell's centre point. */
const BAND_MID_SECONDS: readonly number[] = [2.5, 10, 27.5, 50];
const MAX_SECONDS = 120;

/** What the isochrones need of a ship: its body in space and its design limits. */
export interface Mover {
    readonly position: XY;
    readonly velocity: XY;
    /** Heading, degrees. */
    readonly angle: number;
    /** Degrees per second. */
    readonly turnSpeed: number;
    /** Thrust acceleration (m/s²) per local direction. */
    readonly capacity: Readonly<Record<'fwd' | 'aft' | 'port' | 'stbd', number>>;
    /** deg/s². */
    readonly rotationCapacity: number;
    /** deg/s. */
    readonly maxTurnSpeed: number;
    /** m/s. */
    readonly maxSpeed: number;
}

export function moverOf(state: ShipState, body: Spaceship): Mover {
    return {
        position: body.position,
        velocity: body.velocity,
        angle: body.angle,
        turnSpeed: body.turnSpeed,
        capacity: {
            fwd: state.velocityCapacity(ShipDirection.FWD),
            aft: state.velocityCapacity(ShipDirection.AFT),
            port: state.velocityCapacity(ShipDirection.PORT),
            stbd: state.velocityCapacity(ShipDirection.STBD),
        },
        rotationCapacity: state.rotationCapacity,
        maxTurnSpeed: state.smartPilot.design.maxTurnSpeed,
        maxSpeed: state.maxSpeed,
    };
}

/** Thrust available along a local direction (degrees off the nose) when both thruster axes clamp at 1. */
function thrustAlong(m: Mover, localDegrees: number) {
    const r = (localDegrees * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    const cx = c >= 0 ? m.capacity.fwd : m.capacity.aft;
    const cy = s >= 0 ? m.capacity.port : m.capacity.stbd;
    return Math.min(Math.abs(c) > 1e-9 ? cx / Math.abs(c) : Infinity, Math.abs(s) > 1e-9 ? cy / Math.abs(s) : Infinity);
}

/** Distance gained in `t` seconds of full thrust `a` from rest, capped at `vmax`. */
function reach(a: number, vmax: number, t: number) {
    if (t <= 0 || a <= 0) return 0;
    const tCap = vmax / a;
    return t <= tCap ? 0.5 * a * t * t : vmax * t - (vmax * vmax) / (2 * a);
}

/** Seconds of a rest-to-rest turn through `degrees`, after stopping the current turn. */
function turnSeconds(m: Mover, degrees: number) {
    const R = m.rotationCapacity;
    if (R <= 0) return Infinity;
    const w = m.turnSpeed;
    const stop = Math.abs(w) / R;
    const left = Math.abs(degrees - (Math.sign(w) * w * w) / (2 * R));
    const wmax = Math.max(1e-6, m.maxTurnSpeed);
    const turn = left <= (wmax * wmax) / R ? 2 * Math.sqrt(left / R) : left / wmax + wmax / R;
    return stop + turn;
}

/** Whether the point `rel` (relative to the ship, global axes) is reachable within `T` seconds. */
function reachableWithin(m: Mover, rel: XY, T: number) {
    const miss = XY.difference(rel, XY.scale(m.velocity, T));
    const need = XY.lengthOf(miss);
    if (need <= reach(thrustAlong(m, XY.angleOf(miss) - m.angle), m.maxSpeed, T)) return true;
    const tTurn = turnSeconds(m, offNose(XY.angleOf(rel), m.angle));
    if (tTurn >= T) return false;
    return XY.lengthOf(XY.difference(rel, XY.scale(m.velocity, T))) <= reach(m.capacity.fwd, m.maxSpeed, T - tTurn);
}

/** Lower-bound seconds to reach a global point (bisection to 0.05 s; `MAX_SECONDS` when beyond). */
export function timeToReach(m: Mover, point: XY) {
    const rel = XY.difference(point, m.position);
    if (reachableWithin(m, rel, 0)) return 0;
    if (!reachableWithin(m, rel, MAX_SECONDS)) return MAX_SECONDS;
    let lo = 0;
    let hi = MAX_SECONDS;
    while (hi - lo > 0.05) {
        const mid = (lo + hi) / 2;
        if (reachableWithin(m, rel, mid)) hi = mid;
        else lo = mid;
    }
    return hi;
}

export function bandOfSeconds(seconds: number) {
    const i = BAND_EDGES.findIndex((e) => seconds < e);
    return i < 0 ? BANDS - 1 : i;
}

/** Sector of a global point: 0 is centred on the nose, counting clockwise (positive off-nose). */
export function sectorOf(m: Mover, point: XY) {
    const off = offNose(XY.angleOf(XY.difference(point, m.position)), m.angle);
    const width = 360 / SECTORS;
    return ((Math.round(off / width) % SECTORS) + SECTORS) % SECTORS;
}

interface Cell {
    readonly sector: number;
    readonly band: number;
}

export const cellIndex = ({ sector, band }: Cell) => sector * BANDS + band;
export const cellOfIndex = (i: number): Cell => ({ sector: Math.floor(i / BANDS), band: i % BANDS });
export const cellName = ({ sector, band }: Cell) => `${SECTOR_NAMES[sector]} ${BAND_NAMES[band]}`;

/** The cell a global point falls in, with the bands of this frame. */
export function cellOf(m: Mover, point: XY): Cell & { seconds: number } {
    const seconds = timeToReach(m, point);
    return { sector: sectorOf(m, point), band: bandOfSeconds(seconds), seconds };
}

/** Global point at `seconds` time-to-reach along a bearing off the nose (bisection on distance). */
function pointAt(m: Mover, offNoseDegrees: number, seconds: number) {
    const dir = XY.rotate({ x: 1, y: 0 }, m.angle + offNoseDegrees);
    let lo = 0;
    let hi = 200_000;
    for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (timeToReach(m, XY.add(m.position, XY.scale(dir, mid))) < seconds) lo = mid;
        else hi = mid;
    }
    return XY.add(m.position, XY.scale(dir, lo));
}

/** Each cell's representative point: sector centre bearing at the band's representative time. */
export function cellCentres(m: Mover): XY[] {
    const out: XY[] = [];
    for (let sector = 0; sector < SECTORS; sector++) {
        for (let band = 0; band < BANDS; band++) {
            out.push(pointAt(m, (sector * 360) / SECTORS, BAND_MID_SECONDS[band]));
        }
    }
    return out;
}

/** Distance (m) of each band's outer edge along each sector's centre bearing (for display). */
export function bandRadii(m: Mover): number[][] {
    return Array.from({ length: SECTORS }, (_, sector) =>
        BAND_EDGES.map((e) => XY.lengthOf(XY.difference(pointAt(m, (sector * 360) / SECTORS, e), m.position))),
    );
}
