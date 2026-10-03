import { DockingMode, RecordingEventLine, SavedGame, ScanLevel, XY, getSystems } from '@starwards/core/internal';
import { integrity } from './features';
import { offNose } from '../brain/verbal';

/**
 * The engineer score: how well the ship's systems answer what the rest of the crew and the situation
 * ask of them, how much energy is in hand for what may come, and how intact the systems are. Read
 * from a recording (1 s `SavedGame` frames and the `.events.jsonl` sidecar), from ground truth, never
 * from the trained snapshot scorer.
 *
 * Per frame, over the player ship's systems s:
 * - `e_s = effectiveness × (1 − energyStarved)`;
 * - demand `a_s` in [0, 1] (see {@link demandOf}), from raw state over ±3 s;
 * - service `S = Σ a·e / Σ a`, defined when `Σ a ≥ 0.1`;
 * - reserve `R = 1 − exp(−k·store / N(r))`, store = energy share + 0.3 per energy cell (a cell
 *   jump-starts 30% of the store), `N(r) = N0·(1 + β·r)`;
 * - integrity `D = 1 − Σ(a+ε)·sev / Σ(a+ε)`, sev 1 when broken, else the largest defect fraction off
 *   normal (hacking excluded);
 * - `K = D·((1 − λ)·S + λ·R)`, `λ = min(0.6, λ0 + λ1·r)`; `K = D·R` when `Σ a < 0.1`.
 *
 * Risk `r` in [0, 1] is a fixed logistic of raw danger (see {@link riskOf}). The label
 * `engineer_kpi30` is the mean K over (t, t+30 s].
 *
 * The weights were fitted while energy drawn per unit of output was flat in power; a power-to-draw
 * curve (issue #2305) changes what all-max costs, and the weights must be refit when it lands.
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
 * Best of the grid on the matched-seed validation of 2026-10-03, but failing its predictive constraint
 * and the all-max ordering (`modules/ai/ml/reports/2026-10-03-engineer-kpi.md`): provisional.
 */
export const ENGINEER_WEIGHTS: EngineerWeights = {
    k: 0.5,
    n0: 0.5,
    beta: 0,
    lambda0: 0.3,
    lambda1: 0.4,
    epsilon: 0.01,
};

/** Lambda's cap: reserve never outweighs service. */
const LAMBDA_CAP = 0.6;
/** Below this total demand the ship asks nothing of its systems, and only reserve counts. */
const MIN_DEMAND = 0.1;
/** Half-width of the window demand is read over, seconds. */
const DEMAND_WINDOW = 3;
/** The share of a full store one energy cell restores (`jumpStartReactor`). */
const CELL_STORE = 0.3;
/** Contacts this far beyond the radar's nominal range still ask for scanning. */
const RADAR_REACH_FACTOR = 1.5;
/** A hostile this many of its own gun ranges away threatens the ship. */
const THREAT_RANGE_FACTOR = 2;
/** The player's gun counts as on its target inside this angle off the nose. */
const GUN_ARC_DEGREES = 15;
const FALLBACK_GUN_RANGE = 3000;
export const KPI_HORIZON = 30;

/** One system of one frame: what kind, how much of it works, how damaged it is. */
interface SystemReading {
    readonly kind: string;
    readonly e: number;
    readonly sev: number;
}

/** What one frame shows, before windows over neighbouring frames. */
export interface EngineerObservation {
    readonly t: number;
    readonly systems: readonly SystemReading[];
    /** Largest helm command magnitude: rotation, boost, strafe, afterburner. */
    readonly helm: number;
    readonly gunFiring: boolean;
    readonly gunOnTarget: boolean;
    readonly tubesBusy: boolean;
    readonly unresolved: number;
    readonly warpEngaged: boolean;
    readonly docking: boolean;
    readonly store: number;
    readonly threats: number;
    readonly proximity: number;
    readonly damage: number;
    readonly unscanned: number;
}

/** The weight-free parts of one frame's K, from which any weights give K in O(1). */
export interface EngineerComponents {
    readonly t: number;
    readonly sumA: number;
    readonly service: number;
    readonly store: number;
    readonly risk: number;
    readonly sumAsev: number;
    readonly sumSev: number;
    readonly systems: number;
}

const SYSTEM_KINDS = ['/chainGuns/', '/tubes/', '/radars/', '/thrusters/'];

function kindOf(pointer: string) {
    return SYSTEM_KINDS.find((k) => pointer.startsWith(k))?.slice(1, -1) ?? pointer.slice(1);
}

/** Largest share off normal among a system's defectibles, 1 when broken. */
function severity(broken: boolean, defectibles: readonly { value: number; normal: number }[]) {
    if (broken) return 1;
    let worst = 0;
    for (const d of defectibles) {
        const off = Math.abs(d.value - d.normal) / (d.normal === 0 ? 1 : Math.abs(d.normal));
        worst = Math.max(worst, Math.min(1, off));
    }
    return worst;
}

const angleTo = (from: XY, to: XY) => XY.angleOf(XY.difference(to, from));

/** Reads one frame for the player ship `playerId`; `undefined` when it is gone. */
export function observe(t: number, saved: SavedGame, playerId: string): EngineerObservation | undefined {
    const ship = saved.fragment.ship.get(playerId);
    const body = saved.fragment.space.getShip(playerId);
    if (!ship || !body || body.destroyed) return undefined;
    const systems = getSystems(ship)
        .filter((s) => s.pointer !== '/capsule' && s.pointer !== '/armor')
        .map((s) => ({
            kind: kindOf(s.pointer),
            e: s.state.effectiveness * (s.state.energyStarved ? 0 : 1),
            sev: severity(s.state.broken, s.defectibles),
        }));
    const targetId = ship.weaponsTarget?.targetId;
    const target = targetId ? saved.fragment.space.get(targetId) : undefined;
    const gunRange = ship.chainGuns.at(0)?.design.maxShellRange ?? FALLBACK_GUN_RANGE;
    const gunOnTarget =
        !!target &&
        !target.destroyed &&
        XY.lengthOf(XY.difference(target.position, body.position)) <= gunRange &&
        Math.abs(offNose(angleTo(body.position, target.position), body.angle)) <= GUN_ARC_DEGREES;
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
    const magazine = ship.magazine as unknown as Record<string, number>;
    const missiles = Object.keys(magazine).some(
        (k) => k.startsWith('count_') && k.includes('Missile') && magazine[k] > 0,
    );
    return {
        t,
        systems,
        helm: Math.max(Math.abs(ship.rotation), Math.abs(ship.boost), Math.abs(ship.strafe), ship.afterBurner),
        gunFiring: ship.chainGuns.some((g) => g.isFiring),
        gunOnTarget,
        tubesBusy: ship.tubes.some((tube) => tube.loading > 0) || (!!targetId && missiles && ship.tubes.length > 0),
        unresolved,
        warpEngaged: (ship.warp?.currentLevel ?? 0) > 0 || (ship.warp?.desiredLevel ?? 0) > 0,
        docking: !!ship.docking && ship.docking.mode !== DockingMode.UNDOCKED,
        store: ship.reactor.energy / Math.max(1, ship.reactor.design.maxEnergy) + CELL_STORE * ship.reactor.energyCells,
        threats,
        proximity: Number.isFinite(nearest) ? Math.min(1, 2000 / Math.max(nearest, 1)) : 0,
        damage: 1 - integrity(ship),
        unscanned,
    };
}

/** Demand context of one frame after the ±3 s windows. */
interface Demand {
    readonly helm: number;
    readonly gun: number;
    readonly tubes: number;
    readonly radar: number;
    readonly warp: number;
    readonly docking: number;
}

/**
 * How much the situation asks of a system kind, 0..1: thrusters, maneuvering and smart pilot by the
 * helm's commands; chain guns and magazine by firing or a target in the gun's arc and range; tubes
 * while loading or with a target and missiles; radars and signals by unresolved contacts; the reactor
 * always; warp and docking only while engaged. Anything else asks nothing.
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

/**
 * Fixed logistic of raw danger: hostiles within twice their gun range, nearness of the nearest
 * hostile (2 km / distance, capped at 1), blast hits on the ship per second over the last 10 s, lost
 * integrity, unscanned contacts. Hand-set coefficients, not fitted.
 */
export function riskOf(
    o: Pick<EngineerObservation, 'threats' | 'proximity' | 'damage' | 'unscanned'>,
    blastRate: number,
) {
    const z =
        -3 +
        1.5 * Math.min(o.threats, 3) +
        1.5 * o.proximity +
        4 * Math.min(blastRate, 1) +
        3 * o.damage +
        0.5 * Math.min(o.unscanned, 4);
    return 1 / (1 + Math.exp(-z));
}

const within = (t: number, h: number) => (o: { t: number }) => o.t >= t - h - 1e-6 && o.t <= t + h + 1e-6;

/** Weight-free components of every frame of a run, with the demand windows and blast rates from the sidecar. */
export function components(
    observations: readonly EngineerObservation[],
    events: readonly RecordingEventLine[],
    playerId: string,
): EngineerComponents[] {
    const fireEvents = events.filter(
        (e) => e.objectId === playerId && (e.kind === 'fire_start' || e.kind === 'fire_stop'),
    );
    const blasts = events.filter((e) => e.objectId === playerId && e.kind === 'blast_hit').map((e) => e.t);
    return observations.map((o) => {
        const near = observations.filter(within(o.t, DEMAND_WINDOW));
        const any = (f: (n: EngineerObservation) => boolean) => (near.some(f) ? 1 : 0);
        const demand: Demand = {
            helm: Math.min(1, Math.max(...near.map((n) => n.helm))),
            gun: Math.max(
                any((n) => n.gunFiring || n.gunOnTarget),
                fireEvents.some(within(o.t, DEMAND_WINDOW)) ? 1 : 0,
            ),
            tubes: any((n) => n.tubesBusy),
            radar: 0.2 + 0.8 * (1 - Math.exp(-o.unresolved / 2)),
            warp: o.warpEngaged ? 1 : 0,
            docking: o.docking ? 1 : 0,
        };
        let sumA = 0;
        let sumAe = 0;
        let sumAsev = 0;
        let sumSev = 0;
        for (const s of o.systems) {
            const a = demandOf(s.kind, demand);
            sumA += a;
            sumAe += a * s.e;
            sumAsev += a * s.sev;
            sumSev += s.sev;
        }
        const blastRate = blasts.filter((t) => t > o.t - 10 && t <= o.t).length / 10;
        return {
            t: o.t,
            sumA,
            service: sumA > 0 ? sumAe / sumA : 0,
            store: o.store,
            risk: riskOf(o, blastRate),
            sumAsev,
            sumSev,
            systems: o.systems.length,
        };
    });
}

/** K of one frame under `w`. */
export function engineerKpi(c: EngineerComponents, w: EngineerWeights = ENGINEER_WEIGHTS) {
    const reserve = 1 - Math.exp((-w.k * c.store) / (w.n0 * (1 + w.beta * c.risk)));
    const weight = c.sumA + w.epsilon * c.systems;
    const intact = weight > 0 ? 1 - (c.sumAsev + w.epsilon * c.sumSev) / weight : 1;
    if (c.sumA < MIN_DEMAND) return intact * reserve;
    const lambda = Math.min(LAMBDA_CAP, w.lambda0 + w.lambda1 * c.risk);
    return intact * ((1 - lambda) * c.service + lambda * reserve);
}

/**
 * `engineer_kpi30` of frame `i`: mean K over the frames in (t, t+30 s]; `null` when the run ends
 * (or the ship is lost) before t+30 s.
 */
export function engineerKpi30(cs: readonly EngineerComponents[], i: number, w: EngineerWeights = ENGINEER_WEIGHTS) {
    const now = cs[i].t;
    if (cs[cs.length - 1].t < now + KPI_HORIZON - 1e-6) return null;
    const window = cs.slice(i + 1).filter((c) => c.t <= now + KPI_HORIZON + 1e-6);
    return window.length ? window.reduce((s, c) => s + engineerKpi(c, w), 0) / window.length : null;
}
