import { BrainRequest, buildRequest } from './request';
import { BrainSpec, specHash } from './spec';
import { Capabilities, Control, Display, Press, stationControls } from './controls';
import { Heard, Said, calloutSaid, calloutSources } from './callout';

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

/** One control's outcome at one decision, as recorded beside the game; `seat` is the member seat a fused brain decided it for. */
type Decision = Answer & { control: string; seat?: string; press?: Press };

type DecisionResult = {
    request: BrainRequest;
    decisions: Decision[];
    presses: Press[];
    /** What this brain says on the crew channel, if it chose to speak and its display supplies the values: one per callout question. */
    callouts: Said[];
    meta: {
        brain: string;
        version: number;
        specHash: string;
        policy: string;
        /** The member seats of a fused brain. */
        seats?: string[];
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
                decisions.push({
                    control: control.id,
                    ...(control.seat === undefined ? {} : { seat: control.seat }),
                    ...answer,
                    press: control.press(answer.choice),
                });
            }
            const callouts: Said[] = [];
            for (const { question, seat } of calloutSources(spec)) {
                const answer = answered.answers[question];
                if (!answer) {
                    continue;
                }
                decisions.push({ control: question, ...(seat === undefined ? {} : { seat }), ...answer });
                const said = calloutSaid(spec, answer.choice, display, question);
                if (said) {
                    callouts.push(said);
                }
            }
            return {
                request,
                decisions,
                presses: decisions.flatMap((d) => (d.press ? [d.press] : [])),
                callouts,
                meta: {
                    brain: spec.id,
                    version: spec.version,
                    specHash: hash,
                    policy: policy.name,
                    ...(spec.seats ? { seats: Object.keys(spec.seats) } : {}),
                    model: answered.model,
                    inputTokens: answered.inputTokens,
                    latencyMs: answered.latencyMs,
                },
            };
        },
    };
}

export type ButtonBrain = ReturnType<typeof buttonBrain>;
