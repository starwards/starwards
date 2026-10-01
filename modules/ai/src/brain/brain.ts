import { BrainRequest, buildRequest } from './request';
import { BrainSpec, specHash } from './spec';
import { Capabilities, Control, Display, Press, stationControls } from './controls';

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

/** Answers a brain's request: the model, hand-written rules, or nothing at all. */
export type Policy = { name: string; answer(request: BrainRequest, controls: readonly Control[]): Promise<Answers> };

/** One control's outcome at one decision, as recorded beside the game. */
type Decision = Answer & { control: string; press?: Press };

type DecisionResult = {
    request: BrainRequest;
    decisions: Decision[];
    presses: Press[];
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
 * A station brain that plays by pressing buttons: it shows the whole display, asks one choice per
 * control, and turns the chosen options into console commands. It talks to no other station.
 */
export function buttonBrain(spec: BrainSpec, policy: Policy) {
    const hash = specHash(spec);
    return {
        spec,
        policy,
        async decide(display: Display, capabilities: Capabilities): Promise<DecisionResult> {
            const controls = stationControls({
                display,
                capabilities,
                burstSeconds: Math.min(5, spec.decisionSeconds),
            });
            const request = buildRequest(spec, display, controls);
            const answered = Object.keys(request.questions).length
                ? await policy.answer(request, controls)
                : { answers: {} };
            const decisions: Decision[] = [];
            for (const control of controls) {
                const answer = answered.answers[control.id];
                if (!answer) {
                    continue;
                }
                decisions.push({ control: control.id, ...answer, press: control.press(answer.choice) });
            }
            return {
                request,
                decisions,
                presses: decisions.flatMap((d) => (d.press ? [d.press] : [])),
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
