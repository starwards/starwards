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
 * Aim shortfall is normalized to [0, 1] before weighting; this scale is what keeps a mount that
 * cannot bear at all decisive against the thrust term, whose contribution is bounded by 1. Without
 * it a doctrine with `aim` below `thrust` would fly a bolted gun permanently off the firing line.
 */
export const AIM_COST_SCALE = 5;

/** Cost advantage a challenger heading needs before it displaces the one already held. */
export const HEADING_HYSTERESIS_MARGIN = 0.05;

/** Most a movement order will turn the hull off its destination bearing to bring a mount to bear. */
export const MAX_TRANSIT_HEADING_CONCESSION = 90;

export const doctrineWeights: Record<Exclude<FlightDoctrine, FlightDoctrine.AUTO>, DoctrineWeights> = {
    [FlightDoctrine.INTERCEPT]: { aim: 1, thrust: 0.2, useGunEnvelope: true },
    [FlightDoctrine.STANDOFF]: { aim: 0.4, thrust: 1, useGunEnvelope: true },
    [FlightDoctrine.SHADOW]: { aim: 0, thrust: 1, useGunEnvelope: false },
};
