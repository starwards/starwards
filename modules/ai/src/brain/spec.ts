import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * A brain: everything tunable about how one station is played, as one versioned data file.
 *
 * The code that turns a display into questions and answers into button presses is shared by every
 * brain and every host (headless training, a live game); a better brain is a new version of this
 * file, never new code. `controls` overrides the wording of a control's question or of its options,
 * keyed by control id (`strafe`, `systemPower:/reactor`) or by command for all of a command's
 * controls (`systemPower`); an id wins over its command.
 */
export const brainSpecSchema = z
    .object({
        id: z.string(),
        version: z.number().int().positive(),
        station: z.string(),
        /** Pinned model version: answers, and so tuned wording, can change between versions. */
        model: z.string(),
        /** Simulated seconds between two decisions at this station. */
        decisionSeconds: z.number().positive(),
        /** Below this confidence an answer is not acted on: the control rests, recorded as a fallback. */
        minConfidence: z.number().min(0).max(1).default(0),
        /** Who the brain is and what it is for, given to the model with every question. */
        role: z.string(),
        mission: z.string(),
        controls: z
            .record(
                z.string(),
                z
                    .object({
                        instructions: z.string().optional(),
                        options: z.record(z.string(), z.string()).optional(),
                        /** Leave this control alone: no question is asked and nothing is pressed. */
                        skip: z.boolean().optional(),
                    })
                    .strict(),
            )
            .default({}),
        /** Display paths (`panels.<widget>` or `radar`) left out of the state the model reads. */
        hide: z.array(z.string()).default([]),
    })
    .strict();

export type BrainSpec = z.infer<typeof brainSpecSchema>;

export function loadBrainSpec(filePath: string): BrainSpec {
    return brainSpecSchema.parse(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

/** Identifies the exact wording a recorded decision was made with, so runs can be compared by brain. */
export function specHash(spec: BrainSpec) {
    return createHash('sha256').update(JSON.stringify(spec)).digest('hex').slice(0, 12);
}
