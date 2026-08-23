import { Updateable } from '../src/updateable';

/**
 * Advances any {@link Updateable} by one iteration of `deltaSeconds`. `totalSeconds` defaults to
 * `deltaSeconds` — pass it explicitly where a test cares about elapsed time across iterations.
 */
export function tick(updateable: Updateable, deltaSeconds: number, totalSeconds = deltaSeconds) {
    updateable.update({ deltaSeconds, deltaSecondsAvg: deltaSeconds, totalSeconds });
}
