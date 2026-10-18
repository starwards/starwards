import { CALLOUT_QUESTION, SILENCE } from './callout';
import { inLaunchEnvelope, launchRange, nearestEnemy } from './engagement';

import { Answer } from './brain';
import { BrainRequest } from './request';
import { Display } from './controls';
import { Radar } from './verbal';

/** What a callout rule reads: the radar now and a decision (`seconds`) ago. */
type Picture = {
    radar: Radar | undefined;
    previous: Radar | undefined;
    seconds: number;
    /** The ship the captain last ordered engaged. */
    engaged: string | undefined;
};

/** Whether the nearest enemy is inside the reference missile's launch envelope for how it moves. */
function enemyInEnvelope({ radar, previous, seconds }: Picture) {
    const enemy = nearestEnemy(radar);
    return enemy && inLaunchEnvelope(enemy.distance, launchRange(enemy, radar, previous, seconds));
}

/** The reference's rule for each callout it knows: whether the callout should be said now. */
const calloutRules: Record<string, (picture: Picture) => boolean> = {
    /** Signals: whenever an identified enemy ship is on the radar. */
    enemy_position: ({ radar }) => nearestEnemy(radar) !== undefined,
    /**
     * Captain: an enemy outside the launch envelope; or inside it and already ordered engaged, to bring
     * the ship to gun range while the missiles fly.
     */
    close_to: (picture) =>
        enemyInEnvelope(picture) === false ||
        (enemyInEnvelope(picture) === true && nearestEnemy(picture.radar)?.name === picture.engaged),
    /** Captain: an enemy inside the launch envelope, not yet ordered engaged. */
    engage: (picture) => enemyInEnvelope(picture) === true && nearestEnemy(picture.radar)?.name !== picture.engaged,
    /** Captain: no enemy in sight. */
    hold_here: ({ radar }) => nearestEnemy(radar) === undefined,
};

/**
 * What a reference seat says: the first of its brain's callouts whose rule fires, else silence.
 * Undefined, so the seat says nothing at all, for a brain none of whose callouts has a rule.
 */
export function referenceCallout(
    request: BrainRequest,
    display: Display,
    previous: Display | undefined,
    seconds: number,
    /** The ship this seat last ordered engaged. */
    engaged?: string,
): Answer | undefined {
    const options = Object.keys(request.questions?.[CALLOUT_QUESTION]?.criteria ?? {}).filter((o) => o in calloutRules);
    if (!options.length) {
        return undefined;
    }
    const picture = {
        radar: display.radar as Radar | undefined,
        previous: previous?.radar as Radar | undefined,
        seconds,
        engaged,
    };
    return { choice: options.find((o) => calloutRules[o](picture)) ?? SILENCE, source: 'rule' };
}
