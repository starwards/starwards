import { Updateable } from '../src/updateable';

/** Advances an {@link Updateable} by one iteration. `totalSeconds` matters only across iterations. */
export function tick(updateable: Updateable, deltaSeconds: number, totalSeconds = deltaSeconds) {
    updateable.update({ deltaSeconds, deltaSecondsAvg: deltaSeconds, totalSeconds });
}
