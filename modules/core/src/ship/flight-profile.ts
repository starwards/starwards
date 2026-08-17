import {
    AIM_COST_SCALE,
    DoctrineWeights,
    FlightDoctrine,
    HEADING_HYSTERESIS_MARGIN,
    HEADING_MATCH_TOLERANCE_DEGREES,
    SHADOW_TRACK_RANGE,
    doctrineWeights,
} from './flight-doctrine';
import { RTuple2, XY, getShellAimVelocityCompensation, isInRange, solveShellIntercept, toDegreesDelta } from '../logic';
import { ShipDirection, ShipDirections } from './ship-direction';

import { ShipState, doctrineForOrder } from './ship-state';
import { ChainGun } from './chain-gun';
import { SpaceObject } from '../space';

/**
 * What an NPC brain believes a mount's `bearingSkew` to be. Automation infers this from watching
 * where its own commands land (`AutomationManager.updateTrackedBearingSkew`) — it never reads the
 * real defect (#2176/#2177), so every bearing decision downstream of it must be expressed in these
 * terms rather than through `Turret.restBearing`/`canBearAt`/`bearingCommandFor`, all of which
 * measure off the true skew.
 */
export type BelievedSkew = (gun: ChainGun) => number;

/** {@link BelievedSkew} for a caller with no observations — an undamaged mount's own geometry. */
export const NO_SKEW_BELIEF: BelievedSkew = () => 0;

/** `Turret.restBearing` as the automation believes it to be. */
export function believedRestBearing(gun: ChainGun, believedSkew: BelievedSkew): number {
    return gun.fittedBearing + believedSkew(gun);
}

/** `Turret.bearingCommandFor` as the automation believes it — the command it would actually issue. */
export function believedBearingCommandFor(
    gun: ChainGun,
    targetHullBearing: number,
    believedSkew: BelievedSkew,
): number {
    return toDegreesDelta(targetHullBearing - believedRestBearing(gun, believedSkew));
}

/** `Turret.canBearAt` as the automation believes it. */
export function believedCanBearAt(gun: ChainGun, targetHullBearing: number, believedSkew: BelievedSkew): boolean {
    return Math.abs(believedBearingCommandFor(gun, targetHullBearing, believedSkew)) <= gun.bearingLimit;
}

/**
 * Everything `automation-manager`'s `follow()` needs to fly and shoot at an ordered target: the
 * standoff band, the lead point and which way to point the hull, all from the doctrine's weighting
 * of every mount rather than pinned to `chainGuns[0]`.
 */
export class FlightProfile {
    private lastOffset: number | null = null;

    constructor(
        private readonly state: ShipState,
        private readonly weights: DoctrineWeights,
        private readonly believedSkew: BelievedSkew,
    ) {}

    /**
     * The distance band `positionNearTarget` holds — the widest *single* mount's envelope, not the
     * union of every mount's. A union spans the gap between two non-overlapping envelopes, and a
     * ship holding station in that gap has nothing that can fire.
     */
    trackRange(): RTuple2 {
        const guns = this.state.chainGuns;
        if (guns.length === 0 || !this.weights.useGunEnvelope) {
            return SHADOW_TRACK_RANGE;
        }
        let widest: RTuple2 = [guns[0].design.minShellRange, guns[0].design.maxShellRange];
        for (const gun of guns) {
            if (gun.design.maxShellRange - gun.design.minShellRange > widest[1] - widest[0]) {
                widest = [gun.design.minShellRange, gun.design.maxShellRange];
            }
        }
        return widest;
    }

    /**
     * Shell-lead offset added to the target's position while in range. Velocity-dependent, so
     * callers must keep gating it on `inRange`: applying it while still closing distance re-creates
     * the runaway feedback loop fixed in issue #2083.
     */
    leadCompensation(target: SpaceObject): XY {
        const mount = this.bestMount(target);
        if (!mount) {
            return XY.zero;
        }
        return getShellAimVelocityCompensation(this.state, mount);
    }

    /**
     * Hull-relative bearing (degrees) to park on the target, passed as `rotateToTarget`'s offset.
     * `requiredAcceleration` is the vector the caller is *actually* commanding thrust along this
     * tick — closing, backing off and velocity-matching are three different vectors, and arbitrating
     * aim against thrust for one while thrusting along another optimizes a maneuver nobody is flying.
     */
    headingOffset(target: SpaceObject, requiredAcceleration: XY): number {
        if (this.state.chainGuns.length === 0) {
            return this.lastOffset ?? 0;
        }
        const shipToTarget = XY.difference(target.position, this.state.position);
        return this.bestOffset(shipToTarget, requiredAcceleration);
    }

    /**
     * Absolute hull angle (degrees) that best serves gunnery on `target` while the ship accelerates
     * along `requiredAcceleration`; `null` when there is no mount to serve. Aimed at the same
     * intercept point `aimAndFire` lays each mount's firing line on, so hull and mount agree — a
     * bolted gun clamps its own `bearingCommand` to 0, so the hull heading has to carry the solution.
     */
    gunneryHullAngle(target: SpaceObject, requiredAcceleration: XY): number | null {
        const mount = this.bestMount(target);
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

    /** The mount whose bearing envelope currently covers `target`, or the first one. `null` for a doctrine that ignores gunnery. */
    private bestMount(target: SpaceObject): ChainGun | null {
        if (this.weights.aim === 0) {
            return null;
        }
        const shipToTarget = XY.difference(target.position, this.state.position);
        const hullBearing = toDegreesDelta(XY.angleOf(shipToTarget) - this.state.angle);
        const guns = this.state.chainGuns;
        return guns.find((g) => believedCanBearAt(g, hullBearing, this.believedSkew)) ?? guns[0] ?? null;
    }

    /**
     * Cost-minimizing hull-relative offset shared by {@link headingOffset} and
     * {@link gunneryHullAngle}, along with the `lastOffset` hysteresis state — genuinely "the
     * heading currently held", whichever caller is asking.
     */
    private bestOffset(shipToTarget: XY, requiredAcceleration: XY): number {
        const guns = this.state.chainGuns;
        const maxCapacity = Math.max(0, ...ShipDirections.map((d) => this.state.velocityCapacity(d)));
        const required = XY.lengthOf(requiredAcceleration) > 0.01 ? requiredAcceleration : shipToTarget;
        const candidates = headingCandidates(guns, shipToTarget, required, this.believedSkew);
        // The heading held last tick is rarely reproduced bit-for-bit — every candidate derived from
        // the target's bearing moves with the target. Matching the nearest one within
        // `HEADING_MATCH_TOLERANCE_DEGREES`, and only one so two rivals can't both take the
        // discount, is what makes the margin reach the candidates that do chatter.
        const incumbent = this.lastOffset === null ? null : nearestHeading(candidates, this.lastOffset);

        let best = candidates[0];
        let bestCost = Infinity;
        for (const candidate of candidates) {
            const cost =
                this.weights.aim * aimCost(guns, candidate, this.believedSkew) +
                this.weights.thrust * thrustCost(this.state, maxCapacity, candidate, shipToTarget, required);
            const adjustedCost = candidate === incumbent ? cost - HEADING_HYSTERESIS_MARGIN : cost;
            if (adjustedCost < bestCost) {
                bestCost = adjustedCost;
                best = candidate;
            }
        }
        this.lastOffset = best;
        return best;
    }

    /**
     * Whether a candidate at `distance` is a legitimate target for this ship: *some one* mount's own
     * envelope covers it. Testing the union of every mount's min and max instead would accept a
     * distance falling in the gap between two mounts' bands — a target `resolveOpportunityTarget`
     * caches and `anyMountCanBearOn` then refuses, starving a hostile the ship really could engage.
     */
    isReachable(distance: number): boolean {
        return this.state.chainGuns.some((g) => isInRange(g.design.minShellRange, g.design.maxShellRange, distance));
    }
}

/**
 * Candidate hull-relative headings: one per mount (parks that mount's fixed bearing on the firing
 * line, independent of the target), one per thrust direction (puts *that* direction's local bearing
 * on `required` — see {@link thrustCost}'s matching derivation), plus dead-ahead.
 */
function headingCandidates(guns: ChainGun[], shipToTarget: XY, required: XY, believedSkew: BelievedSkew): number[] {
    const requiredAngle = XY.angleOf(required);
    const targetAngle = XY.angleOf(shipToTarget);
    const fromMounts = guns.map((g) => -believedRestBearing(g, believedSkew));
    const fromDirections = ShipDirections.map((d) => requiredAngle - targetAngle - d);
    const all = [0, ...fromMounts, ...fromDirections];
    const deduped: number[] = [];
    for (const c of all) {
        const normalized = toDegreesDelta(c);
        if (!deduped.some((d) => isSameHeading(d, normalized))) {
            deduped.push(normalized);
        }
    }
    return deduped;
}

/**
 * Whether two headings are the same one for arbitration — one definition for both
 * {@link headingCandidates}' dedup and {@link FlightProfile.bestOffset}'s incumbent match, so a
 * candidate list can never split two headings the hysteresis treats as one, or the reverse.
 */
function isSameHeading(a: number, b: number): boolean {
    return Math.abs(toDegreesDelta(a - b)) <= HEADING_MATCH_TOLERANCE_DEGREES;
}

/** The candidate closest to `heading`, or `null` when none is within {@link isSameHeading}. */
function nearestHeading(candidates: number[], heading: number): number | null {
    let nearest: number | null = null;
    let smallestSeparation = Infinity;
    for (const candidate of candidates) {
        const separation = Math.abs(toDegreesDelta(candidate - heading));
        if (separation < smallestSeparation && isSameHeading(candidate, heading)) {
            smallestSeparation = separation;
            nearest = candidate;
        }
    }
    return nearest;
}

/**
 * Normalized [0, 1] shortfall for holding heading `offset`: how far past its bearing limit each
 * mount would be, summed and scaled (see {@link AIM_COST_SCALE}). Holding `offset` puts the target
 * at hull-relative `-offset`; each mount's traverse to reach it is measured off the rest bearing the
 * automation *believes* it has, so a skewed mount is scored on the window its own observations say
 * it has — not on the one the real defect gives it.
 */
function aimCost(guns: ChainGun[], offset: number, believedSkew: BelievedSkew): number {
    let shortfall = 0;
    for (const gun of guns) {
        const desiredBearing = believedBearingCommandFor(gun, -offset, believedSkew);
        shortfall += Math.max(0, Math.abs(desiredBearing) - gun.bearingLimit) / 180;
    }
    return Math.min(1, (shortfall * AIM_COST_SCALE) / guns.length);
}

/**
 * Normalized [0, 1] cost of holding heading `offset`: 0 when the strongest thrust axis at that
 * heading matches `required`, 1 when it is the weakest. A ship with no thrust at all (a station)
 * scores 0 everywhere, leaving the whole decision to {@link aimCost}. The predicted hull angle at
 * `offset` is `angleOf(shipToTarget) + offset` (`rotateToTarget`'s steady state) — using the ship's
 * *current* angle would close the #2083-class loop this arbitration exists to avoid.
 */
function thrustCost(state: ShipState, maxCapacity: number, offset: number, shipToTarget: XY, required: XY): number {
    if (maxCapacity <= 0) {
        return 0;
    }
    const local = XY.rotate(required, -(XY.angleOf(shipToTarget) + offset));
    const direction =
        Math.abs(local.x) >= Math.abs(local.y)
            ? local.x >= 0
                ? ShipDirection.FWD
                : ShipDirection.AFT
            : local.y >= 0
              ? ShipDirection.PORT
              : ShipDirection.STBD;
    return 1 - state.velocityCapacity(direction) / maxCapacity;
}

/**
 * `believedSkew` defaults to {@link NO_SKEW_BELIEF} — correct for a caller that has observed
 * nothing, which is also every profile built for an undamaged ship. `AutomationManager` passes its
 * own running belief so the hull heading it steers to agrees with the mount commands it issues.
 */
export function makeFlightProfile(
    state: ShipState,
    doctrine: FlightDoctrine,
    believedSkew: BelievedSkew = NO_SKEW_BELIEF,
): FlightProfile {
    const resolved: Exclude<FlightDoctrine, FlightDoctrine.AUTO> =
        doctrine === FlightDoctrine.AUTO ? doctrineForOrder(state.order) : doctrine;
    return new FlightProfile(state, doctrineWeights[resolved], believedSkew);
}
