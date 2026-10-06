import {
    DockingMode,
    PowerLevel,
    RecordingEventLine,
    SavedGame,
    ScanLevel,
    SmartPilotMode,
    XY,
    getSystems,
} from '@starwards/core/internal';
import { integrity } from './features';

/**
 * The engineer score: how well the ship's systems answer what the other seats ask of them, how much
 * energy is in hand for what may come, and how intact the demanded systems will be. Read from a
 * recording (1 s `SavedGame` frames and the `.events.jsonl` sidecar), from ground truth, never from
 * the trained snapshot scorer.
 *
 * Per frame t, over the player ship's systems s:
 * - supply `e_s = (power / NORMAL) × hacked × (1 − energyStarved)`, 0 when broken, uncapped: since
 *   energy draw grows as (power / NORMAL)² per unit of time (#2305), overdrive pays through the reserve;
 * - demand `a_s` in [0, 1] from what the other seats request (see {@link demandOf}), never from what
 *   the ship achieved, so a shut-down ship still registers what it was asked for;
 * - need `n_s = 1 + a_s·(MAX / NORMAL − 1)`: NORMAL power when nothing is asked, MAX when fully asked;
 *   the reactor's standing demand needs NORMAL only;
 * - service `S = Σ a·min(e, n) / Σ a·n`: supply is credited up to the need, never beyond;
 * - reserve `R = 1 − exp(−k·store / N(r))`, store = the reactor's energy share, `N(r) = N0·(1 + β·r)`.
 *   Energy cells are a fallback, not reserve: an unspent cell while the store runs dry is a failure;
 * - integrity `D_t = 1 − Σ(a+ε)·sev / Σ(a+ε)`, sev 1 when broken, else the largest defect fraction off
 *   normal (hacking excluded), and its look-ahead `D60` = mean D over [t, t+60 s] of the run, so
 *   damage an action causes (an overheat) lands on the frames that caused it;
 * - `K = D60·((1 − λ)·S + λ·R·min(1, S / S0))`, `λ = min(0.6, λ0 + λ1·r)`: the reserve is insurance on what
 *   the ship delivers, not a second source of score. It is credited in proportion to delivery until the
 *   service reaches `S0` ({@link DELIVERY_FULL}), so a ship that powers nothing earns no reserve credit
 *   however much energy it holds. `K = D60·R` when `Σ a < 0.1` (unreachable while the reactor is always
 *   demanded).
 *
 * Risk `r` in [0, 1] is a logistic of raw danger fitted to whether the ship loses integrity in the
 * next 30 s ({@link RISK_MODEL}). The label `engineer_kpi30` is the mean K over (t, t+30 s].
 */
export interface EngineerWeights {
    readonly k: number;
    readonly n0: number;
    readonly beta: number;
    readonly lambda0: number;
    readonly lambda1: number;
    readonly epsilon: number;
}

/**
 * Reserve set by design: `λ0` 0.3, `λ1` 0.4; the store the engineer should hold rises from 0.25 at no
 * risk to 0.5 at full risk (`N0` 0.25, `β` 1), and holding it earns R = 0.9 (`k = ln 10`). `ε` is fitted
 * on the matched-seed validation of 2026-10-03 (`modules/ai/ml/reports/2026-10-03-engineer-kpi.md`).
 */
export const ENGINEER_WEIGHTS: EngineerWeights = {
    k: Math.LN10,
    n0: 0.25,
    beta: 1,
    lambda0: 0.3,
    lambda1: 0.4,
    epsilon: 0,
};

/** Raw danger, in {@link RiskModel} coefficient order. */
export const RISK_FEATURES = ['threats', 'proximity', 'blastRate', 'damage', 'unscanned'] as const;
export type RiskFeatures = Record<(typeof RISK_FEATURES)[number], number>;

/** Logistic of the raw risk features: `r = σ(bias + Σ coef·x)`. */
export interface RiskModel {
    readonly bias: number;
    readonly coef: readonly number[];
}

/**
 * Fitted on the matched-seed validation of 2026-10-03 to P(integrity loss ≥ 0.02 in the next 30 s), with
 * non-negative coefficients: more danger never lowers risk.
 */
export const RISK_MODEL: RiskModel = { bias: -4.803, coef: [2.323, 0.527, 1.997, 0, 0.883] };

const LAMBDA_CAP = 0.6;
/**
 * Service at which the reserve is credited in full. Below it the credit shrinks in proportion: the held
 * energy of a ship that delivers (almost) nothing is not an engineer's reserve. Results are unchanged for
 * any value from 0.1 to 0.3 (the only ships below it are shut down).
 */
export const DELIVERY_FULL = 0.3;
/** Below this total demand nothing is asked of the systems and only reserve counts: K = D·R. */
const MIN_DEMAND = 0.1;
/** Half-width of the window requests are read over, seconds. */
const DEMAND_WINDOW = 3;
/** How far the integrity term looks ahead, seconds. */
export const DAMAGE_HORIZON = 60;
export const KPI_HORIZON = 30;
/** Contacts this far beyond the radar's nominal range still ask for scanning. */
const RADAR_REACH_FACTOR = 1.5;
/** A hostile this many of its own gun ranges away threatens the ship. */
const THREAT_RANGE_FACTOR = 2;
const FALLBACK_GUN_RANGE = 3000;
/** A held target lock asks this much of the guns between bursts. */
const LOCK_DEMAND = 0.5;

interface SystemReading {
    readonly kind: string;
    readonly e: number;
    readonly sev: number;
}

/** What one frame shows, before windows over neighbouring frames and events. */
export interface EngineerObservation {
    readonly t: number;
    readonly systems: readonly SystemReading[];
    /** Largest standing helm request on the smart pilot: rotation, maneuvering, or a TARGET mode (1). */
    readonly helmRequest: number;
    readonly locked: boolean;
    readonly unresolved: number;
    readonly warpEngaged: boolean;
    readonly docking: boolean;
    readonly store: number;
    readonly cells: number;
    readonly integrity: number;
    readonly risk: Omit<RiskFeatures, 'blastRate'>;
}

/** Weight-free per-frame inputs of K. */
export interface EngineerComponents {
    readonly t: number;
    readonly sumA: number;
    readonly service: number;
    readonly store: number;
    readonly cells: number;
    readonly features: RiskFeatures;
    readonly sumAsev: number;
    readonly sumSev: number;
    readonly systems: number;
    readonly integrity: number;
}

const SYSTEM_KINDS = ['/chainGuns/', '/tubes/', '/radars/', '/thrusters/'];

function kindOf(pointer: string) {
    return SYSTEM_KINDS.find((k) => pointer.startsWith(k))?.slice(1, -1) ?? pointer.slice(1);
}

function severity(broken: boolean, defectibles: readonly { value: number; normal: number }[]) {
    if (broken) return 1;
    let worst = 0;
    for (const d of defectibles) {
        const off = Math.abs(d.value - d.normal) / (d.normal === 0 ? 1 : Math.abs(d.normal));
        worst = Math.max(worst, Math.min(1, off));
    }
    return worst;
}

/** Supply of one system in units of NORMAL power. */
export function supply(state: { broken: boolean; power: number; hacked: number; energyStarved: boolean }) {
    if (state.broken || state.energyStarved) return 0;
    return (state.power / PowerLevel.NORMAL) * state.hacked;
}

const MAX_SUPPLY = PowerLevel.MAX / PowerLevel.NORMAL;

/**
 * Supply a system needs under demand `a`: NORMAL power when nothing is asked, MAX when fully asked. The
 * reactor's demand is standing, not a seat's request, so it never asks for overdrive.
 */
export function needOf(a: number, kind?: string) {
    return kind === 'reactor' ? 1 : 1 + a * (MAX_SUPPLY - 1);
}

/** Reads one frame for the player ship `playerId`; `undefined` when it is gone. */
export function observe(t: number, saved: SavedGame, playerId: string): EngineerObservation | undefined {
    const ship = saved.fragment.ship.get(playerId);
    const body = saved.fragment.space.getShip(playerId);
    if (!ship || !body || body.destroyed) return undefined;
    const systems = getSystems(ship)
        .filter((s) => s.pointer !== '/capsule' && s.pointer !== '/armor')
        .map((s) => ({ kind: kindOf(s.pointer), e: supply(s.state), sev: severity(s.state.broken, s.defectibles) }));
    const pilot = ship.smartPilot;
    const tracking =
        Number(pilot.rotationMode) === Number(SmartPilotMode.TARGET) ||
        Number(pilot.maneuveringMode) === Number(SmartPilotMode.TARGET);
    const radarRange = Math.max(0, ...ship.radars.map((r) => r.design.range));
    let unresolved = 0;
    let unscanned = 0;
    let threats = 0;
    let nearest = Infinity;
    for (const other of saved.fragment.space.getAll('Spaceship')) {
        if (other.id === playerId || other.destroyed) continue;
        const distance = XY.lengthOf(XY.difference(other.position, body.position));
        const level = Number(other.scanLevels.at(body.faction) ?? ScanLevel.UFO);
        if (distance <= RADAR_REACH_FACTOR * radarRange && level < Number(ScanLevel.FULL)) unresolved++;
        if (level === Number(ScanLevel.UFO)) unscanned++;
        if (other.faction !== body.faction) {
            const range =
                saved.fragment.ship.get(other.id)?.chainGuns.at(0)?.design.maxShellRange ?? FALLBACK_GUN_RANGE;
            if (distance <= THREAT_RANGE_FACTOR * range) threats++;
            nearest = Math.min(nearest, distance);
        }
    }
    const own = integrity(ship);
    return {
        t,
        systems,
        helmRequest: tracking
            ? 1
            : Math.min(
                  1,
                  Math.max(Math.abs(pilot.rotation), Math.abs(pilot.maneuvering.x), Math.abs(pilot.maneuvering.y)),
              ),
        locked: !!ship.weaponsTarget?.targetId,
        unresolved,
        warpEngaged: (ship.warp?.desiredLevel ?? 0) > 0,
        docking: !!ship.docking && ship.docking.mode !== DockingMode.UNDOCKED,
        store: ship.reactor.energy / Math.max(1, ship.reactor.design.maxEnergy),
        cells: ship.reactor.energyCells,
        integrity: own,
        risk: {
            threats: Math.min(threats, 3),
            proximity: Number.isFinite(nearest) ? Math.min(1, 2000 / Math.max(nearest, 1)) : 0,
            damage: 1 - own,
            unscanned: Math.min(unscanned, 4),
        },
    };
}

/** What the other seats ask for at one frame. */
interface Demand {
    readonly helm: number;
    readonly gun: number;
    readonly tubes: number;
    readonly radar: number;
    readonly warp: number;
    readonly docking: number;
}

/**
 * How much the seats' requests ask of a system kind, 0..1: thrusters, maneuvering and smart pilot by
 * helms' standing commands and afterburner presses; chain guns and magazine by weapons choosing to
 * fire (1) or holding a lock ({@link LOCK_DEMAND}); tubes by tube commands; radars and signals by
 * unresolved contacts; the reactor always; warp and docking only while requested. Anything else asks
 * nothing.
 */
export function demandOf(kind: string, d: Demand) {
    switch (kind) {
        case 'thrusters':
        case 'maneuvering':
        case 'smartPilot':
            return d.helm;
        case 'chainGuns':
        case 'magazine':
            return d.gun;
        case 'tubes':
            return d.tubes;
        case 'radars':
        case 'signals':
            return d.radar;
        case 'reactor':
            return 1;
        case 'warp':
            return d.warp;
        case 'docking':
            return d.docking;
        default:
            return 0;
    }
}

const isNear = (t: number, x: number) => x >= t - DEMAND_WINDOW - 1e-6 && x <= t + DEMAND_WINDOW + 1e-6;

type Request = { station?: string; control?: string; command?: string; choice?: string; value?: unknown };

function requestTimes(events: readonly RecordingEventLine[], kind: string, match: (d: Request) => boolean) {
    return events.filter((e) => e.kind === kind && match((e.data ?? {}) as Request)).map((e) => e.t);
}

/** Weight-free components of every frame of a run, with requests and blast rates from the sidecar. */
export function components(
    observations: readonly EngineerObservation[],
    events: readonly RecordingEventLine[],
    playerId: string,
): EngineerComponents[] {
    const mine = events.filter((e) => e.objectId === playerId);
    const fires = requestTimes(
        mine,
        'decision',
        (d) => d.station === 'weapons' && !!d.control?.startsWith('fireChainGun') && d.choice === 'fire',
    );
    const afterBurner = requestTimes(mine, 'command', (d) => d.command === 'afterBurner' && Number(d.value) > 0);
    const tubes = requestTimes(mine, 'command', (d) => d.station === 'weapons' && /tube/i.test(d.command ?? ''));
    const blasts = mine.filter((e) => e.kind === 'blast_hit').map((e) => e.t);
    return observations.map((o) => {
        const around = observations.filter((n) => isNear(o.t, n.t));
        const demand: Demand = {
            helm: Math.max(...around.map((n) => n.helmRequest), afterBurner.some((x) => isNear(o.t, x)) ? 1 : 0),
            gun: fires.some((x) => isNear(o.t, x)) ? 1 : around.some((n) => n.locked) ? LOCK_DEMAND : 0,
            tubes: tubes.some((x) => isNear(o.t, x)) ? 1 : 0,
            radar: 0.2 + 0.8 * (1 - Math.exp(-o.unresolved / 2)),
            warp: o.warpEngaged ? 1 : 0,
            docking: o.docking ? 1 : 0,
        };
        let sumA = 0;
        let sumAn = 0;
        let sumAe = 0;
        let sumAsev = 0;
        let sumSev = 0;
        for (const s of o.systems) {
            const a = demandOf(s.kind, demand);
            sumA += a;
            const need = needOf(a, s.kind);
            sumAn += a * need;
            sumAe += a * Math.min(s.e, need);
            sumAsev += a * s.sev;
            sumSev += s.sev;
        }
        return {
            t: o.t,
            sumA,
            service: sumAn > 0 ? sumAe / sumAn : 0,
            store: o.store,
            cells: o.cells,
            features: { ...o.risk, blastRate: Math.min(1, blasts.filter((t) => t > o.t - 10 && t <= o.t).length / 10) },
            sumAsev,
            sumSev,
            systems: o.systems.length,
            integrity: o.integrity,
        };
    });
}

export function riskOf(features: RiskFeatures, model: RiskModel = RISK_MODEL) {
    const z = RISK_FEATURES.reduce((s, f, i) => s + model.coef[i] * features[f], model.bias);
    return 1 / (1 + Math.exp(-z));
}

function intactness(c: EngineerComponents, epsilon: number) {
    const weight = c.sumA + epsilon * c.systems;
    return weight > 0 ? 1 - (c.sumAsev + epsilon * c.sumSev) / weight : 1;
}

/** Mean D over [t, t+{@link DAMAGE_HORIZON} s] of the run, for every frame. */
export function damageLookahead(cs: readonly EngineerComponents[], epsilon: number): number[] {
    const d = cs.map((c) => intactness(c, epsilon));
    return cs.map((c, i) => {
        let sum = 0;
        let n = 0;
        for (let j = i; j < cs.length && cs[j].t <= c.t + DAMAGE_HORIZON + 1e-6; j++) {
            sum += d[j];
            n++;
        }
        return sum / n;
    });
}

/** K of one frame from its look-ahead integrity `d60` and risk `r`. */
export function kpiOf(
    c: Pick<EngineerComponents, 'service' | 'store' | 'sumA'>,
    d60: number,
    r: number,
    w: EngineerWeights,
) {
    const reserve = 1 - Math.exp((-w.k * c.store) / (w.n0 * (1 + w.beta * r)));
    if (c.sumA < MIN_DEMAND) return d60 * reserve;
    const lambda = Math.min(LAMBDA_CAP, w.lambda0 + w.lambda1 * r);
    return d60 * ((1 - lambda) * c.service + lambda * reserve * Math.min(1, c.service / DELIVERY_FULL));
}

/** K of every frame of a run under `w` and `risk`. */
export function engineerKpiSeries(
    cs: readonly EngineerComponents[],
    w: EngineerWeights = ENGINEER_WEIGHTS,
    risk: RiskModel = RISK_MODEL,
): number[] {
    const d60 = damageLookahead(cs, w.epsilon);
    return cs.map((c, i) => kpiOf(c, d60[i], riskOf(c.features, risk), w));
}

/** `engineer_kpi30` of every frame: mean K over (t, t+30 s]; `null` when the run ends before t+30 s. */
export function engineerKpi30(
    cs: readonly EngineerComponents[],
    w: EngineerWeights = ENGINEER_WEIGHTS,
    risk: RiskModel = RISK_MODEL,
): (number | null)[] {
    const k = engineerKpiSeries(cs, w, risk);
    const end = cs.at(-1)?.t ?? 0;
    return cs.map((c, i) => {
        if (end < c.t + KPI_HORIZON - 1e-6) return null;
        let sum = 0;
        let n = 0;
        for (let j = i + 1; j < cs.length && cs[j].t <= c.t + KPI_HORIZON + 1e-6; j++) {
            sum += k[j];
            n++;
        }
        return n ? sum / n : null;
    });
}
