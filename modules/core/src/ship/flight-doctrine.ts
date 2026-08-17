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
 * How steeply aim shortfall climbs before it saturates — at 36° outside a mount's arc.
 * @see docs/SUBSYSTEMS.md#hull-heading-arbitration
 */
export const AIM_COST_SCALE = 5;

/** Cost advantage a challenger heading needs before it displaces the one already held. */
export const HEADING_HYSTERESIS_MARGIN = 0.05;

/**
 * How far a candidate heading may sit from the one held last tick and still be the *same* heading.
 * Clears a tick's worth of target drift (~0.9° at 20 Hz for a 300 m/s crosser a kilometre out),
 * far below the separation between distinct candidates.
 * @see docs/SUBSYSTEMS.md#hull-heading-arbitration
 */
export const HEADING_MATCH_TOLERANCE_DEGREES = 2;

/** Most a movement order will turn the hull off its destination bearing to bring a mount to bear. */
export const MAX_TRANSIT_HEADING_CONCESSION = 90;

export const doctrineWeights: Record<Exclude<FlightDoctrine, FlightDoctrine.AUTO>, DoctrineWeights> = {
    [FlightDoctrine.INTERCEPT]: { aim: 1, thrust: 0.2, useGunEnvelope: true },
    [FlightDoctrine.STANDOFF]: { aim: 0.4, thrust: 1, useGunEnvelope: true },
    [FlightDoctrine.SHADOW]: { aim: 0, thrust: 1, useGunEnvelope: false },
};
