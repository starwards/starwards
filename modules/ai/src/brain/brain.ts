import { BrainRequest, buildRequest } from './request';
import { BrainSpec, specHash } from './spec';
import { CALLOUT_QUESTION, Heard, Said, calloutSaid } from './callout';
import { Capabilities, Control, Display, Press, stationControls } from './controls';

import { verbalReader } from './verbal';
import { whatIfForecaster } from '../whatif/forecast';

/** How one question was answered. `source` says who answered: the model, or a fallback. */
export type Answer = {
    choice: string;
    confidence?: number;
    probabilities?: Record<string, number>;
    source: 'model' | 'rule' | 'fallback';
};

/** What answered a whole request, and what it cost. */
export type Answers = {
    answers: Record<string, Answer>;
    model?: string;
    inputTokens?: number;
    latencyMs?: number;
};

/** Answers a brain's request: the model, hand-written rules, or nothing at all. Rules read the raw `display`; a model reads only the request. */
export type Policy = {
    name: string;
    answer(request: BrainRequest, controls: readonly Control[], display: Display): Promise<Answers>;
};

/** One control's outcome at one decision, as recorded beside the game. */
type Decision = Answer & { control: string; press?: Press };

type DecisionResult = {
    request: BrainRequest;
    decisions: Decision[];
    presses: Press[];
    /** What this seat says on the crew channel, if it chose to speak and its display supplies the values. */
    callout?: Said;
    meta: {
        brain: string;
        version: number;
        specHash: string;
        policy: string;
        model?: string;
        inputTokens?: number;
        latencyMs?: number;
    };
};

/**
 * A station brain that plays by pressing buttons: it shows the whole display (and what it heard from
 * the crew), asks one choice per control (and, with `callouts`, what to say), and turns the chosen
 * options into console commands and a callout.
 */
export function buttonBrain(spec: BrainSpec, policy: Policy) {
    const hash = specHash(spec);
    const read = spec.view === 'verbal' ? verbalReader(spec.decisionSeconds) : undefined;
    const forecast = whatIfForecaster(spec);
    return {
        spec,
        policy,
        async decide(display: Display, capabilities: Capabilities, heard?: readonly Heard[]): Promise<DecisionResult> {
            const controls = stationControls({
                display,
                capabilities,
                burstSeconds: Math.min(5, spec.decisionSeconds),
            });
            const request = buildRequest(
                spec,
                display,
                controls,
                read?.(display),
                heard,
                forecast?.(display, controls),
            );
            const answered = Object.keys(request.questions).length
                ? await policy.answer(request, controls, display)
                : { answers: {} };
            const decisions: Decision[] = [];
            for (const control of controls) {
                const answer = answered.answers[control.id];
                if (!answer) {
                    continue;
                }
                decisions.push({ control: control.id, ...answer, press: control.press(answer.choice) });
            }
            const callout = answered.answers[CALLOUT_QUESTION];
            if (callout && CALLOUT_QUESTION in request.questions) {
                decisions.push({ control: CALLOUT_QUESTION, ...callout });
            }
            return {
                request,
                decisions,
                presses: decisions.flatMap((d) => (d.press ? [d.press] : [])),
                callout: callout && calloutSaid(spec, callout.choice, display),
                meta: {
                    brain: spec.id,
                    version: spec.version,
                    specHash: hash,
                    policy: policy.name,
                    model: answered.model,
                    inputTokens: answered.inputTokens,
                    latencyMs: answered.latencyMs,
                },
            };
        },
    };
}

export type ButtonBrain = ReturnType<typeof buttonBrain>;
