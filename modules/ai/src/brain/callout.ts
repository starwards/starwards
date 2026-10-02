import { BrainSpec } from './spec';
import { ChoiceQuestion } from './request';

/** The question id of a brain's callout, beside its controls' questions. */
export const CALLOUT_QUESTION = 'callout';
/** The callout option that says nothing. */
export const SILENCE = 'silence';

/** A callout as a listener hears it: which station said it and how many seconds ago. */
export type Heard = { speaker: string; phrase: string; secondsAgo: number };

const SILENCE_CRITERION =
    'say nothing: the crew hears nothing new from you. Choose this when nothing the crew needs to know has changed since you last spoke.';

/** What a seat heard, read out as an officer would: `Weapons said "target locked" 2 s ago`. */
export function heardLines(heard: readonly Heard[]): string[] {
    return heard.map(
        (h) =>
            `${h.speaker.charAt(0).toUpperCase()}${h.speaker.slice(1)} said "${h.phrase}" ${Math.round(h.secondsAgo)} s ago`,
    );
}

/**
 * The callout question of a brain with `callouts`: one option per fixed phrase, described by what
 * saying it tells the crew and when to say it, plus `silence`. Undefined for a brain without callouts.
 */
export function calloutQuestion(spec: BrainSpec): ChoiceQuestion | undefined {
    if (!spec.callouts) {
        return undefined;
    }
    const criteria: Record<string, string> = {};
    for (const [option, callout] of Object.entries(spec.callouts)) {
        criteria[option] = `say "${callout.say}": ${callout.when}`;
    }
    criteria[SILENCE] = SILENCE_CRITERION;
    return {
        type: 'choice',
        instructions:
            spec.controls[CALLOUT_QUESTION]?.instructions ??
            'You are the `role`, speaking to the rest of the crew on the ship radio. `heard` is what they said lately. Do you call something out right now?',
        criteria,
    };
}

/** The phrase a callout answer says, or undefined for silence or an unknown option. */
export function calloutPhrase(spec: BrainSpec, choice: string): string | undefined {
    return choice === SILENCE ? undefined : spec.callouts?.[choice]?.say;
}
