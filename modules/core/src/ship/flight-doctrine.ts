import { RTuple2 } from '../logic';

/**
 * How an NPC weighs the two competing claims on its hull heading: gunnery aim (a mount with no
 * traverse can only be brought to bear by pointing the hull) against propulsion efficiency (a hull
 * with more thrusters on one axis accelerates harder along it). `AUTO` defers to the ship's
 * `order`; anything else overrides it.
 */
export enum FlightDoctrine {
    AUTO,
    INTERCEPT,
    STANDOFF,
    SHADOW,
}

export type DoctrineWeights = {
    /** How much a mount that cannot bear on the target costs, per unit of shortfall. */
    aim: number;
    /** How much accelerating along a weak thrust axis costs. */
    thrust: number;
    /**
     * Whether the standoff band comes from the guns' design envelope. When false the doctrine has
     * no interest in shooting and holds {@link SHADOW_TRACK_RANGE} instead.
     */
    useGunEnvelope: boolean;
};

/** Standoff band for a doctrine that ignores gunnery entirely. */
export const SHADOW_TRACK_RANGE: RTuple2 = [1000, 3000];

/**
 * How steeply aim shortfall climbs before it saturates. `aimCost` measures shortfall as a fraction
 * of a half-circle clamped to 1, so unscaled a mount 36° outside its arc scores 0.2 — barely
 * distinguishable from one 18° out, when both are equally unable to fire. This saturates at 36°, so
 * anything past a modest miss reads as "cannot bear" outright. Saturated aim then contributes
 * `weights.aim`, and `doctrineWeights` decides whether that outweighs a rival heading's thrust cost.
 */
export const AIM_COST_SCALE = 5;

/** Cost advantage a challenger heading needs before it displaces the one already held. */
export const HEADING_HYSTERESIS_MARGIN = 0.05;

/**
 * How far a candidate heading may sit from the one held last tick and still be the *same* heading.
 *
 * Only the mount candidates are fixed numbers; the rest drift with the target, so an exact match
 * would recognize the incumbent only for the headings that never chatter. The tolerance clears a
 * tick's worth of drift — a target crossing at 300 m/s a kilometre out sweeps ~17°/s, ~0.9° per tick
 * at 20 Hz — while staying far below the tens of degrees separating genuinely distinct candidates.
 */
export const HEADING_MATCH_TOLERANCE_DEGREES = 2;

/** Most a movement order will turn the hull off its destination bearing to bring a mount to bear. */
export const MAX_TRANSIT_HEADING_CONCESSION = 90;

export const doctrineWeights: Record<Exclude<FlightDoctrine, FlightDoctrine.AUTO>, DoctrineWeights> = {
    [FlightDoctrine.INTERCEPT]: { aim: 1, thrust: 0.2, useGunEnvelope: true },
    [FlightDoctrine.STANDOFF]: { aim: 0.4, thrust: 1, useGunEnvelope: true },
    [FlightDoctrine.SHADOW]: { aim: 0, thrust: 1, useGunEnvelope: false },
};
