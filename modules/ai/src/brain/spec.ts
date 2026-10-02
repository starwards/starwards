import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * Values a parameterised callout can carry, each read off the speaker's own display:
 * `lockedOffNose` (weapons: the locked contact's degrees and side off the nose) and `gunSkew`
 * (engineer: a chain gun's damage skew from the damage report).
 */
export const calloutFills = ['lockedOffNose', 'gunSkew'] as const;
export type CalloutFill = (typeof calloutFills)[number];

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
                        /**
                         * The callouts this decision listens for, as `<station>.<callout option>`
                         * (`weapons.need_turn`): those heard lately are read out in this question's
                         * instructions, and no other question sees them.
                         */
                        hears: z.array(z.string().regex(/^\w+\.\w+$/)).optional(),
                    })
                    .strict(),
            )
            .default({}),
        /**
         * What the model reads: `display`, the panels and radar as the console's data, or `verbal`,
         * the same display read out as sentences by `verbal.ts` (`console` in the state).
         */
        view: z.enum(['display', 'verbal']).default('display'),
        /** Display paths (`panels.<widget>` or `radar`) left out of the state the model reads. */
        hide: z.array(z.string()).default([]),
        /**
         * Crew talk: the fixed phrases this station may say on the crew channel, keyed by option name.
         * `say` is the phrase the other seats hear; `when` describes what saying it tells the crew and
         * "choose this when ...". With callouts, every decision asks one more question, `callout`, over
         * these options and `silence` (wording override: `controls.callout.instructions`).
         * With `fill`, `say` is a template whose `{degrees}` and `{side}` code fills from this
         * station's own display when the callout is said; a display that does not show the value says
         * nothing.
         */
        callouts: z
            .record(
                z.string().refine((k) => k !== 'silence', 'silence is always an option'),
                z.object({ say: z.string(), when: z.string(), fill: z.enum(calloutFills).optional() }).strict(),
            )
            .optional(),
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
