import { Control, Display } from './controls';
import { Forecasts, withForecasts } from '../whatif/forecast';
import { Heard, calloutQuestions, heardFor, heardLines } from './callout';

import { BrainSpec } from './spec';

/** One choice question in a snap-judgment request: pick exactly one option. */
export type ChoiceQuestion = { type: 'choice'; instructions: string; criteria: Record<string, string> };

/** A whole decision: the station's display as state, one choice question per control, and the callout question of a talking brain. */
export type BrainRequest = { state: Record<string, unknown>; questions: Record<string, ChoiceQuestion> };

/**
 * Builds the request a brain asks at one decision. Every control is one question over its own
 * options, all in one request, because the questions share the same display and are answered in
 * parallel and in isolation.
 */
export function buildRequest(
    spec: BrainSpec,
    display: Display,
    controls: readonly Control[],
    reading?: readonly string[],
    /** What the seat heard on the crew channel; undefined for a seat on no channel. */
    heard?: readonly Heard[],
    /** The predicted effect of each option of the controls whose wording names a what-if plug-in. */
    forecasts?: Forecasts,
): BrainRequest {
    const questions: Record<string, ChoiceQuestion> = {};
    // a brain whose controls name the callouts they listen for hears per decision; any other hears everything in `heard`
    const perDecision = Object.values(spec.controls).some((w) => w.hears);
    for (const control of controls) {
        const wording = { ...spec.controls[control.command], ...spec.controls[control.id] };
        if (wording.skip) {
            continue;
        }
        const instructions = wording.instructions ?? defaultInstructions(control, reading ? 'console' : 'display');
        const radio = heard && wording.hears ? heardFor(heard, wording.hears) : [];
        questions[control.id] = {
            type: 'choice',
            instructions: radio.length ? `${instructions} On the radio: ${radio.join('; ')}.` : instructions,
            criteria: withForecasts(
                { ...control.options, ...pick(wording.options ?? {}, Object.keys(control.options)) },
                forecasts?.[control.id],
            ),
        };
    }
    Object.assign(questions, calloutQuestions(spec));
    return {
        state: {
            station: spec.station,
            role: spec.role,
            mission: spec.mission,
            ...(reading ? { console: reading } : { display: visibleDisplay(display, spec.hide) }),
            ...(heard && !perDecision ? { heard: heardLines(heard) } : {}),
        },
        questions,
    };
}

function defaultInstructions(control: Control, view: 'console' | 'display') {
    const [, target] = control.id.split(':');
    const subject =
        target === undefined
            ? `the \`${control.command}\` control`
            : `the \`${control.command}\` control for \`${target}\``;
    return `You are the \`role\` at the console shown in \`${view}\`, working toward \`mission\`. What do you do with ${subject} right now?`;
}

function pick(record: Record<string, string>, keys: readonly string[]) {
    return Object.fromEntries(Object.entries(record).filter(([k]) => keys.includes(k)));
}

function visibleDisplay(display: Display, hide: readonly string[]) {
    const panels = Object.fromEntries(
        Object.entries(display.panels).filter(([name]) => !hide.includes(`panels.${name}`)),
    );
    return hide.includes('radar') || display.radar === undefined ? { panels } : { panels, radar: display.radar };
}
