import { CALLOUT_QUESTION, SILENCE } from './callout';
import { MISSILE_LAUNCH_BAND_METERS, nearestEnemy } from './engagement';

import { Answer } from './brain';
import { BrainRequest } from './request';
import { Display } from './controls';
import { Radar } from './verbal';

/** The reference's rule for each callout it knows: whether the callout should be said now. */
const calloutRules: Record<string, (radar: Radar | undefined) => boolean> = {
    /** Signals: whenever an identified enemy ship is on the radar. */
    enemy_position: (radar) => nearestEnemy(radar) !== undefined,
    /** Captain: an enemy beyond missile range, or too close for a missile to arm. */
    close_to: (radar) => {
        const enemy = nearestEnemy(radar);
        return (
            enemy !== undefined &&
            (enemy.distance > MISSILE_LAUNCH_BAND_METERS.max || enemy.distance < MISSILE_LAUNCH_BAND_METERS.min)
        );
    },
    /** Captain: an enemy inside missile range. */
    engage: (radar) => {
        const enemy = nearestEnemy(radar);
        return (
            enemy !== undefined &&
            enemy.distance >= MISSILE_LAUNCH_BAND_METERS.min &&
            enemy.distance <= MISSILE_LAUNCH_BAND_METERS.max
        );
    },
    /** Captain: no enemy in sight. */
    hold_here: (radar) => nearestEnemy(radar) === undefined,
};

/**
 * What a reference seat says: the first of its brain's callouts whose rule fires, else silence.
 * Undefined, so the seat says nothing at all, for a brain none of whose callouts has a rule.
 */
export function referenceCallout(request: BrainRequest, display: Display): Answer | undefined {
    const options = Object.keys(request.questions?.[CALLOUT_QUESTION]?.criteria ?? {}).filter((o) => o in calloutRules);
    if (!options.length) {
        return undefined;
    }
    const radar = display.radar as Radar | undefined;
    return { choice: options.find((o) => calloutRules[o](radar)) ?? SILENCE, source: 'rule' };
}
