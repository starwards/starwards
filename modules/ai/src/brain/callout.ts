import { BrainSpec, CalloutFill } from './spec';
import { Radar, offNose } from './verbal';

import { ChoiceQuestion } from './request';
import { Display } from './controls';
import { radarReach } from '@starwards/core/internal';

/** The question id of a brain's callout, beside its controls' questions. */
export const CALLOUT_QUESTION = 'callout';
/** The callout option that says nothing. */
export const SILENCE = 'silence';

/**
 * A callout as a listener hears it: which station said it, which of its callout options (absent in
 * runs recorded before options were carried), the phrase as said, and how many seconds ago.
 */
export type Heard = { speaker: string; callout?: string; phrase: string; secondsAgo: number };

/**
 * What a seat puts on the air: the callout option it chose and the phrase with its values filled in.
 * `seat` names the member seat that said it, for a fused brain's callouts.
 */
export type Said = { callout: string; phrase: string; seat?: string };

/** The callout question of one seat of a fused brain. */
export function seatCalloutQuestion(seat: string) {
    return `${CALLOUT_QUESTION}:${seat}`;
}

type Callouts = NonNullable<BrainSpec['callouts']>;

/** Every callout question a brain asks, by question id, with the callouts it chooses among and the seat that says them. */
export function calloutSources(spec: BrainSpec): { question: string; callouts: Callouts; seat?: string }[] {
    const sources: { question: string; callouts: Callouts; seat?: string }[] = spec.callouts
        ? [{ question: CALLOUT_QUESTION, callouts: spec.callouts }]
        : [];
    for (const [seat, { callouts }] of Object.entries(spec.seats ?? {})) {
        if (callouts) {
            sources.push({ question: seatCalloutQuestion(seat), callouts, seat });
        }
    }
    return sources;
}

type FillValues = Record<string, string>;

const SILENCE_CRITERION =
    'say nothing: the crew hears nothing new from you. Choose this when nothing the crew needs to know has changed since you last spoke.';

/** Degrees and side of a signed angle, positive to the right; undefined under 1°, where there is nothing to say. */
function degreesAndSide(degrees: number): FillValues | undefined {
    const size = Math.round(Math.abs(degrees));
    return size < 1 ? undefined : { degrees: String(size), side: degrees > 0 ? 'right' : 'left' };
}

/**
 * The values a parameterised callout reads off the SPEAKER's own display, so a seat can only say what
 * its station shows. Undefined when the display does not show it: the callout is then not said.
 */
const calloutFills: Record<CalloutFill, (display: Display) => FillValues | undefined> = {
    /** Weapons: how far the locked contact lies off the nose (the gun line), and to which side. */
    lockedOffNose: ({ panels, radar }) => {
        const targetId = (panels['targeting-status'] as { targetId?: string | null } | undefined)?.targetId;
        const r = radar as Radar | undefined;
        const locked = targetId ? r?.contacts?.find((c) => c.id === targetId) : undefined;
        return locked && r?.ownShip ? degreesAndSide(offNose(locked.bearing, r.ownShip.heading)) : undefined;
    },
    /** Engineer: how far damage has bent a chain gun off the nose, from the damage report. */
    gunSkew: ({ panels }) => {
        const report = panels['damage-report'];
        const skew = Array.isArray(report)
            ? (report as { system: string; field: string; value: number }[]).find(
                  (d) => d.system.startsWith('/chainGuns/') && d.field === 'bearingSkew',
              )
            : undefined;
        return skew && degreesAndSide(skew.value);
    },
    /**
     * Signals: the nearest contact its long-range radar shows beyond the helms radar's reach (outside
     * warp), which helms cannot see. Identified non-ships (rocks, nebulae) are left out; an
     * unidentified blip may be a ship, so it counts.
     */
    farContact: ({ radar }) => {
        const r = radar as Radar | undefined;
        const far = r?.contacts?.find(
            (c) => c.distance > radarReach.helms && (c.type === undefined || c.type === 'Spaceship'),
        );
        if (!far || !r?.ownShip) {
            return undefined;
        }
        const off = Math.round(offNose(far.bearing, r.ownShip.heading));
        return {
            name: far.name,
            range: (far.distance / 1000).toFixed(1),
            bearing:
                Math.abs(off) < 1 ? 'dead on the nose' : `${Math.abs(off)}° ${off > 0 ? 'right' : 'left'} of the nose`,
        };
    },
};

/** What a seat heard, read out as an officer would: `Weapons said "target locked" 2 s ago`. */
export function heardLines(heard: readonly Heard[]): string[] {
    return heard.map(
        (h) =>
            `${h.speaker.charAt(0).toUpperCase()}${h.speaker.slice(1)} said "${h.phrase}" ${Math.round(h.secondsAgo)} s ago`,
    );
}

/** The heard callouts one control listens for (`hears`: `<station>.<callout option>`), read out as `heardLines`. */
export function heardFor(heard: readonly Heard[], hears: readonly string[]): string[] {
    return heardLines(heard.filter((h) => h.callout !== undefined && hears.includes(`${h.speaker}.${h.callout}`)));
}

/**
 * The callout questions of a brain, by question id: one option per phrase, described by what saying
 * it tells the crew and when to say it, plus `silence`. Empty for a brain without callouts.
 */
export function calloutQuestions(spec: BrainSpec): Record<string, ChoiceQuestion> {
    return Object.fromEntries(
        calloutSources(spec).map(({ question, callouts }) => [question, calloutQuestion(spec, question, callouts)]),
    );
}

function calloutQuestion(spec: BrainSpec, question: string, callouts: Callouts): ChoiceQuestion {
    const criteria: Record<string, string> = {};
    for (const [option, callout] of Object.entries(callouts)) {
        criteria[option] =
            `say "${callout.say}"${callout.fill ? ' (the values are filled in from your console)' : ''}: ${callout.when}`;
    }
    criteria[SILENCE] = SILENCE_CRITERION;
    return {
        type: 'choice',
        instructions:
            spec.controls[question]?.instructions ??
            'You are the `role`, speaking to the rest of the crew on the ship radio. `heard` is what they said lately. Do you call something out right now?',
        criteria,
    };
}

/**
 * What a callout answer puts on the air: its phrase, with `{name}` placeholders filled from the
 * speaker's display by the callout's `fill`. Undefined for silence, an unknown option, or a fill the
 * display cannot supply.
 */
export function calloutSaid(
    spec: BrainSpec,
    choice: string,
    display: Display,
    question = CALLOUT_QUESTION,
): Said | undefined {
    const source = calloutSources(spec).find((s) => s.question === question);
    const callout = choice === SILENCE ? undefined : source?.callouts[choice];
    if (!callout) {
        return undefined;
    }
    const seat = source?.seat === undefined ? {} : { seat: source.seat };
    if (!callout.fill) {
        return { callout: choice, phrase: callout.say, ...seat };
    }
    const values = calloutFills[callout.fill](display);
    return (
        values && {
            callout: choice,
            phrase: callout.say.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m),
            ...seat,
        }
    );
}
