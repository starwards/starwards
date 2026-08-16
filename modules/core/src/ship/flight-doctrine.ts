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
 * of a half-circle and clamps the result to 1, so without a scale a mount 36° outside its arc would
 * score 0.2 — barely distinguishable from one 18° out, when both are equally unable to fire. This
 * saturates at 36° instead, so anything past a modest miss reads as "cannot bear" outright.
 *
 * It does not decide the arbitration. Saturated aim contributes `weights.aim`, which only outweighs
 * a rival heading's thrust penalty where `doctrineWeights` says it should: decisive under INTERCEPT
 * (`aim` 1 against `thrust` 0.2), a genuine trade under STANDOFF (0.4 against 1), ignored under
 * SHADOW.
 */
export const AIM_COST_SCALE = 5;

/** Cost advantage a challenger heading needs before it displaces the one already held. */
export const HEADING_HYSTERESIS_MARGIN = 0.05;

/**
 * How far a candidate heading may sit from the one held last tick and still be the *same* heading.
 *
 * Only the mount candidates are fixed numbers; every candidate derived from the target's bearing
 * moves as the target does, so an exact match recognizes the incumbent for exactly the headings
 * that never chatter and never for the ones that do. The tolerance has to clear a tick's worth of
 * that drift: a target crossing at 300 m/s a kilometre out sweeps ~17°/s, which is ~0.9° per tick at
 * 20 Hz. 2° covers that with room for a faster crossing, and stays far below the separation between
 * genuinely distinct candidates — mounts and thrust axes sit tens of degrees apart.
 */
export const HEADING_MATCH_TOLERANCE_DEGREES = 2;

/** Most a movement order will turn the hull off its destination bearing to bring a mount to bear. */
export const MAX_TRANSIT_HEADING_CONCESSION = 90;

export const doctrineWeights: Record<Exclude<FlightDoctrine, FlightDoctrine.AUTO>, DoctrineWeights> = {
    [FlightDoctrine.INTERCEPT]: { aim: 1, thrust: 0.2, useGunEnvelope: true },
    [FlightDoctrine.STANDOFF]: { aim: 0.4, thrust: 1, useGunEnvelope: true },
    [FlightDoctrine.SHADOW]: { aim: 0, thrust: 1, useGunEnvelope: false },
};
