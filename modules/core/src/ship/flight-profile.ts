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
 * What an NPC brain believes a mount's `bearingSkew` to be. Never `Turret.restBearing` or
 * `Turret.bearingCommandFor`, which measure off the true skew.
 * @see docs/SUBSYSTEMS.md#believed-bearing-skew
 */
export type BelievedSkew = (gun: ChainGun) => number;

/** `Turret.restBearing` as the automation believes it to be. */
function believedRestBearing(gun: ChainGun, believedSkew: BelievedSkew): number {
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

/** Whether the automation believes this mount can be brought to `targetHullBearing`. */
export function believedCanBearAt(gun: ChainGun, targetHullBearing: number, believedSkew: BelievedSkew): boolean {
    return Math.abs(believedBearingCommandFor(gun, targetHullBearing, believedSkew)) <= gun.bearingLimit;
}

/**
 * Everything `automation-manager`'s `follow()` needs to fly and shoot at an ordered target: the
 * standoff band, the lead point and which way to point the hull, weighted across every mount.
 * @see docs/SUBSYSTEMS.md#hull-heading-arbitration
 */
export class FlightProfile {
    private lastOffset: number | null = null;

    constructor(
        private readonly state: ShipState,
        private readonly weights: DoctrineWeights,
        private readonly believedSkew: BelievedSkew,
    ) {}

    /**
     * The distance band `positionNearTarget` holds — the widest *single* mount's envelope. A union
     * of every mount's spans the gap between two non-overlapping ones, where nothing can fire.
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
     * Shell-lead offset added to the target's position. Velocity-dependent, so callers must keep
     * gating it on `inRange`: applying it while closing re-creates issue #2083's runaway loop.
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
     * `requiredAcceleration` must be the vector the caller is *actually* thrusting along this tick,
     * or `XY.zero` when the maneuver in flight makes no heading claim (e.g. a velocity-hold in
     * range) -- `bestOffset` falls back to line-of-sight for a zero vector rather than reading it
     * as "thrusting toward the target".
     * @see docs/SUBSYSTEMS.md#hull-heading-arbitration
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
     * intercept point `aimAndFire` uses — a bolted gun clamps `bearingCommand` to 0, so the hull
     * heading has to carry the solution.
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
     * @see docs/SUBSYSTEMS.md#hull-heading-arbitration
     */
    private bestOffset(shipToTarget: XY, requiredAcceleration: XY): number {
        const guns = this.state.chainGuns;
        const maxCapacity = Math.max(0, ...ShipDirections.map((d) => this.state.velocityCapacity(d)));
        const required = XY.lengthOf(requiredAcceleration) > 0.01 ? requiredAcceleration : shipToTarget;
        const candidates = headingCandidates(guns, shipToTarget, required, this.believedSkew);
        // Nearest match, and only one, so two rivals can't both take the hysteresis discount.
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
     * Whether *some one* mount's own envelope covers `distance`. The union of every mount's min and
     * max would also accept the gap between two bands, where nothing can actually fire.
     */
    isReachable(distance: number): boolean {
        return this.state.chainGuns.some((g) => isInRange(g.design.minShellRange, g.design.maxShellRange, distance));
    }
}

/**
 * Candidate hull-relative headings: one per mount, one per thrust direction, plus dead-ahead.
 * @see docs/SUBSYSTEMS.md#hull-heading-arbitration
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
 * {@link headingCandidates}' dedup and `bestOffset`'s incumbent match, so a candidate list can
 * never split two headings the hysteresis treats as one, or the reverse.
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
 * Normalized [0, 1] shortfall for holding heading `offset` — which puts the target at hull-relative
 * `-offset` — measured off each mount's *believed* rest bearing.
 * @see docs/SUBSYSTEMS.md#hull-heading-arbitration
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
 * heading matches `required`, 1 when it is the weakest.
 * @see docs/SUBSYSTEMS.md#hull-heading-arbitration
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
 * `believedSkew` defaults to an undamaged mount's own geometry; `AutomationManager` passes its own
 * running belief so the hull heading it steers to agrees with the mount commands it issues.
 */
export function makeFlightProfile(
    state: ShipState,
    doctrine: FlightDoctrine,
    believedSkew: BelievedSkew = () => 0,
): FlightProfile {
    const resolved: Exclude<FlightDoctrine, FlightDoctrine.AUTO> =
        doctrine === FlightDoctrine.AUTO ? doctrineForOrder(state.order) : doctrine;
    return new FlightProfile(state, doctrineWeights[resolved], believedSkew);
}
