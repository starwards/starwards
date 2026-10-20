/**
 * A HiExp missile's cruise speed (T3-incoming, 2026-10-19: 600 m/s from launch to detonation) and the
 * slack on its time of flight: weapons counts a missile in flight until then.
 */
const MISSILE_SPEED = 600;
const FLIGHT_SLACK_SECONDS = 5;

/** Seconds a missile launched now flies to a target `distance` away closing at `closing` m/s, with slack. */
export function flightSeconds(distance: number, closing: number) {
    return distance / Math.max(MISSILE_SPEED / 2, MISSILE_SPEED + closing) + FLIGHT_SLACK_SECONDS;
}

/** Of missiles due to arrive at `arrivals`, how many still fly at `now`. */
export function stillFlying(arrivals: readonly number[], now: number) {
    return arrivals.filter((t) => t > now).length;
}
