import { CALLOUT_QUESTION, Heard, SILENCE } from './callout';
import { inLaunchEnvelope, launchRange, nearestEnemy } from './engagement';

import { Answer } from './brain';
import { BrainRequest } from './request';
import { Display } from './controls';
import { Radar } from './verbal';

type XY = { x: number; y: number };

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

/** The captain's latest order to helms: the world point to fly to, or to hold where the ship is. */
type HelmOrder = { kind: 'close'; spot: XY; at: number } | { kind: 'hold'; at: number };

/**
 * What a reference seat remembers of the captain's orders, from what it hears: the latest helm order
 * (close to a point, or hold) and the name of the ship to engage. A callout is heard for a few
 * seconds after it is said, so an order is taken once, when first heard, and kept until the next.
 */
export function captainOrders() {
    let helm: HelmOrder | undefined;
    let engage: { name: string; at: number } | undefined;
    const newer = (at: number, than: { at: number } | undefined) => !than || at > than.at + 1e-3;
    return {
        /** Takes the orders in `heard` at the seat's clock `seconds`, the own ship at `own` (world). */
        hear(heard: readonly Heard[] | undefined, seconds: number, own: XY | undefined) {
            for (const h of heard ?? []) {
                const at = seconds - h.secondsAgo;
                if (h.speaker !== 'captain') {
                    continue;
                }
                if (h.callout === 'close_to' && h.values && own && newer(at, helm)) {
                    const distance = Number(h.values.distance) * 1000;
                    const range = Number(h.values.range) * 1000;
                    const rad = (Number(h.values.bearing) * Math.PI) / 180;
                    const run = distance - range;
                    helm = {
                        kind: 'close',
                        spot: { x: own.x + run * Math.cos(rad), y: own.y + run * Math.sin(rad) },
                        at,
                    };
                } else if (h.callout === 'hold_here' && newer(at, helm)) {
                    helm = { kind: 'hold', at };
                } else if (h.callout === 'engage' && h.values?.name && newer(at, engage)) {
                    engage = { name: h.values.name, at };
                }
            }
        },
        get helm() {
            return helm;
        },
        /** The name of the ship the captain last ordered engaged. */
        get engage() {
            return engage?.name;
        },
    };
}

export type CaptainOrders = ReturnType<typeof captainOrders>;
