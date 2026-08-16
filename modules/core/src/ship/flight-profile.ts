import {
    AIM_COST_SCALE,
    DoctrineWeights,
    FlightDoctrine,
    HEADING_HYSTERESIS_MARGIN,
    SHADOW_TRACK_RANGE,
    doctrineWeights,
} from './flight-doctrine';
import { RTuple2, XY, getShellAimVelocityCompensation, solveShellIntercept, toDegreesDelta } from '../logic';
import { ShipDirection, ShipDirections } from './ship-direction';

import { ShipState, doctrineForOrder } from './ship-state';
import { ChainGun } from './chain-gun';
import { SpaceObject } from '../space';

/**
 * Everything `automation-manager`'s `follow()` needs to fly and shoot at an ordered target, decided
 * for the whole ship rather than pinned to `chainGuns[0]` — the standoff band, the lead point, and
 * which way to point the hull are all derived from the doctrine's weighting of every mount, not
 * just the first one.
 */
export interface FlightProfile {
    /** The distance band `positionNearTarget` holds from the target. */
    trackRange(): RTuple2;
    /**
     * Shell-lead offset added to the target's position while in range. Velocity-dependent by
     * design (`getShellAimVelocityCompensation`) — callers must keep gating this on `inRange`
     * themselves; applying it while still closing distance re-creates the runaway feedback loop
     * fixed in issue #2083.
     */
    leadCompensation(target: SpaceObject): XY;
    /**
     * Hull-relative bearing (degrees) to park on the target, passed as `rotateToTarget`'s offset.
     * `requiredAcceleration` is the vector the caller is *actually* commanding thrust along this
     * tick — closing on the target, backing off it, or matching its velocity are three different
     * vectors, and arbitrating aim against thrust for one while thrusting along another optimizes
     * a maneuver the ship is not flying.
     */
    headingOffset(target: SpaceObject, requiredAcceleration: XY): number;
    /** Whether `candidate`, at `distance`, is a legitimate re-acquisition target for this ship. */
    isReachable(candidate: SpaceObject, distance: number): boolean;
    /**
     * Absolute hull angle (degrees) that best serves gunnery on `target` while the ship must
     * accelerate along `requiredAcceleration`. `null` when the doctrine has no interest in gunnery
     * (`aim` weight 0 — SHADOW) or the ship carries no mounts.
     */
    gunneryHullAngle(target: SpaceObject, requiredAcceleration: XY): number | null;
}

class WeightedFlightProfile implements FlightProfile {
    private lastOffset: number | null = null;

    constructor(
        private readonly state: ShipState,
        private readonly weights: DoctrineWeights,
    ) {}

    trackRange(): RTuple2 {
        const guns = this.state.chainGuns;
        if (guns.length === 0 || !this.weights.useGunEnvelope) {
            return SHADOW_TRACK_RANGE;
        }
        return [
            Math.min(...guns.map((g) => g.design.minShellRange)),
            Math.max(...guns.map((g) => g.design.maxShellRange)),
        ];
    }

    leadCompensation(target: SpaceObject): XY {
        const guns = this.state.chainGuns;
        // Doctrines with no interest in gunnery (SHADOW) never bias the aim point toward a gun's
        // firing line — matching a doctrine's `aim` weight of 0 in `headingOffset`.
        const mount = this.weights.aim === 0 ? null : bestTraversableMount(this.state, guns, target);
        if (!mount) {
            return XY.zero;
        }
        return getShellAimVelocityCompensation(this.state, mount);
    }

    headingOffset(target: SpaceObject, requiredAcceleration: XY): number {
        const guns = this.state.chainGuns;
        if (guns.length === 0) {
            return this.lastOffset ?? 0;
        }
        const shipToTarget = XY.difference(target.position, this.state.position);
        return this.bestOffset(shipToTarget, requiredAcceleration);
    }

    gunneryHullAngle(target: SpaceObject, requiredAcceleration: XY): number | null {
        const guns = this.state.chainGuns;
        // `null` when the doctrine has no interest in gunnery (aim weight 0 — SHADOW) or the hull
        // carries no mounts, both of which surface as no mount to pick.
        // A bolted gun's own bearingCommand clamps to 0 — it never swings onto the firing solution
        // the way a traversing mount does, so the hull heading itself has to carry it. That is the
        // same aim point `aimAndFire` lays each mount's firing line on, so hull and mount agree.
        const mount = this.weights.aim === 0 ? null : bestTraversableMount(this.state, guns, target);
        if (!mount) {
            return null;
        }
        const { aimPoint } = solveShellIntercept(this.state, mount, target);
        const shipToTarget = XY.difference(aimPoint, this.state.position);
        if (XY.isZero(shipToTarget)) {
            return null;
        }
        return XY.angleOf(shipToTarget) + this.bestOffset(shipToTarget, requiredAcceleration);
    }

    /**
     * Cost-minimizing hull-relative offset shared by {@link headingOffset} and
     * {@link gunneryHullAngle} — and its `lastOffset` hysteresis state, which is genuinely "the
     * heading currently held" regardless of which caller is asking.
     */
    private bestOffset(shipToTarget: XY, required: XY): number {
        const guns = this.state.chainGuns;
        const capacities = ShipDirections.map((d) => this.state.velocityCapacity(d));
        const maxCapacity = Math.max(0, ...capacities);
        const candidates = headingCandidates(guns, shipToTarget, required);

        let best = candidates[0];
        let bestCost = Infinity;
        for (const candidate of candidates) {
            const cost =
                this.weights.aim * aimCost(guns, candidate) +
                this.weights.thrust * thrustCost(this.state, maxCapacity, candidate, shipToTarget, required);
            const isCurrent = this.lastOffset !== null && toDegreesDelta(candidate - this.lastOffset) === 0;
            const adjustedCost = isCurrent ? cost - HEADING_HYSTERESIS_MARGIN : cost;
            if (adjustedCost < bestCost) {
                bestCost = adjustedCost;
                best = candidate;
            }
        }
        this.lastOffset = best;
        return best;
    }

    isReachable(_candidate: SpaceObject, distance: number): boolean {
        const guns = this.state.chainGuns;
        if (guns.length === 0) {
            return false;
        }
        return (
            distance <= Math.max(...guns.map((g) => g.design.maxShellRange)) &&
            distance >= Math.min(...guns.map((g) => g.design.minShellRange))
        );
    }
}

/** The mount whose bearing envelope currently covers `target`, or the first mount if none do. */
function bestTraversableMount(state: ShipState, guns: ChainGun[], target: SpaceObject): ChainGun | null {
    const shipToTarget = XY.difference(target.position, state.position);
    const hullBearing = toDegreesDelta(XY.angleOf(shipToTarget) - state.angle);
    return guns.find((g) => g.canBearAt(hullBearing)) ?? guns[0] ?? null;
}

/**
 * Candidate hull-relative headings: one per mount (parks that mount's fixed bearing on the firing
 * line, independent of the target — see the `offset = -restBearing` derivation in the module
 * doc), one per thrust direction (the offset that puts *that* direction's local bearing on the
 * required-acceleration vector — see {@link thrustCost}'s matching derivation), plus dead-ahead.
 */
function headingCandidates(guns: ChainGun[], shipToTarget: XY, targetVelocity: XY): number[] {
    const required = XY.lengthOf(targetVelocity) > 0.01 ? targetVelocity : shipToTarget;
    const requiredAngle = XY.angleOf(required);
    const targetAngle = XY.angleOf(shipToTarget);
    const fromMounts = guns.map((g) => -g.restBearing);
    const fromDirections = ShipDirections.map((d) => requiredAngle - targetAngle - d);
    const all = [0, ...fromMounts, ...fromDirections];
    const deduped: number[] = [];
    for (const c of all) {
        const normalized = toDegreesDelta(c);
        if (!deduped.some((d) => toDegreesDelta(d - normalized) === 0)) {
            deduped.push(normalized);
        }
    }
    return deduped;
}

/**
 * Normalized [0, 1] shortfall for holding heading `offset`: how far past its bearing limit each
 * mount would be, summed and scaled so a mount that can't bear at all dominates {@link thrustCost},
 * whose contribution never exceeds 1 (see {@link AIM_COST_SCALE}). Holding `offset` puts the target
 * at hull-relative `-offset`, and the traverse each mount needs to reach it is measured off its
 * rest bearing — fitted plus damage skew — so a skewed mount is scored on the window it really has.
 */
function aimCost(guns: ChainGun[], offset: number): number {
    let shortfall = 0;
    for (const gun of guns) {
        const desiredBearing = gun.bearingCommandFor(-offset);
        shortfall += Math.max(0, Math.abs(desiredBearing) - gun.bearingLimit) / 180;
    }
    return Math.min(1, (shortfall * AIM_COST_SCALE) / guns.length);
}

/**
 * Normalized [0, 1] cost of holding heading `offset` given the required approach: 0 when the
 * strongest thrust axis at that heading matches the required-acceleration vector, 1 when the ship
 * has no thrust at all (stations) — leaving the whole heading decision to {@link aimCost}. The
 * predicted hull angle at `offset` is `angleOf(shipToTarget) + offset` (`rotateToTarget`'s steady
 * state) — using the ship's *current* angle here would close the #2083-class loop this arbitration
 * is required to avoid.
 */
function thrustCost(
    state: ShipState,
    maxCapacity: number,
    offset: number,
    shipToTarget: XY,
    targetVelocity: XY,
): number {
    if (maxCapacity <= 0) {
        return 0;
    }
    const required = XY.lengthOf(targetVelocity) > 0.01 ? targetVelocity : shipToTarget;
    const predictedAngle = XY.angleOf(shipToTarget) + offset;
    const localRequired = XY.rotate(required, -predictedAngle);
    const direction = strongestAxis(localRequired);
    return 1 - state.velocityCapacity(direction) / maxCapacity;
}

function strongestAxis(local: XY): ShipDirection {
    return Math.abs(local.x) >= Math.abs(local.y)
        ? local.x >= 0
            ? ShipDirection.FWD
            : ShipDirection.AFT
        : local.y >= 0
          ? ShipDirection.PORT
          : ShipDirection.STBD;
}

export function makeFlightProfile(state: ShipState, doctrine: FlightDoctrine): FlightProfile {
    const resolved: Exclude<FlightDoctrine, FlightDoctrine.AUTO> =
        doctrine === FlightDoctrine.AUTO ? doctrineForOrder(state.order) : doctrine;
    return new WeightedFlightProfile(state, doctrineWeights[resolved]);
}
