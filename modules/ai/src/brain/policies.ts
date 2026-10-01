import { Answer, Policy } from './brain';

import { BrainSpec } from './spec';
import { JevClient } from './jev-client';

/** Leaves every control as it is: the crew member who never showed up. */
export const idlePolicy: Policy = {
    name: 'idle',
    answer: (_request, controls) =>
        Promise.resolve({
            answers: Object.fromEntries(
                controls.map((c) => [c.id, { choice: c.rest, source: 'rule' } satisfies Answer]),
            ),
        }),
};

/**
 * Asks Jev every question of a decision in one request. An answer outside the control's options,
 * a missing answer, or one under the brain's confidence floor rests the control instead, and is
 * recorded as a fallback so tuning can see how often the brain was not trusted.
 */
export function jevPolicy(spec: BrainSpec, client: JevClient): Policy {
    return {
        name: 'jev',
        async answer(request, controls) {
            const response = await client.ask(request, spec.model);
            const answers: Record<string, Answer> = {};
            for (const control of controls) {
                if (!(control.id in request.questions)) {
                    continue;
                }
                const given = response.answers[control.id];
                const trusted = given && given.choice in control.options && given.confidence >= spec.minConfidence;
                answers[control.id] = trusted
                    ? {
                          choice: given.choice,
                          confidence: given.confidence,
                          probabilities: given.probabilities,
                          source: 'model',
                      }
                    : {
                          choice: control.rest,
                          confidence: given?.confidence,
                          probabilities: given?.probabilities,
                          source: 'fallback',
                      };
            }
            return { answers, model: response.model, inputTokens: response.inputTokens, latencyMs: response.latencyMs };
        },
    };
}
