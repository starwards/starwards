import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { whatIfNames } from '../whatif/whatif';
import { z } from 'zod';

/**
 * Values a parameterised callout can carry, each read off the speaker's own display:
 * `lockedOffNose` (weapons: the locked contact's degrees and side off the nose) and `gunSkew`
 * (engineer: a chain gun's damage skew from the damage report), `farContact` (signals: the nearest
 * contact beyond the helms radar's reach, its name, range and side of the nose), `enemyContact`
 * (signals: the nearest identified enemy ship, its name, range, side of the nose and whether the range
 * closes), `closeOrder`, `gunCloseOrder` and `engageOrder` (captain: the order to close to missile range, or to gun range,
 * of the nearest enemy, and to engage it), `dockOrder` (captain: the nearest allied station to dock at, its
 * distance, world bearing and radius), `patrolOrder` (captain: the nearest nebula to patrol behind, and
 * the nearest enemy it hides the ship from), `lockedTarget` (weapons: the locked ship's name),
 * `lockedEnvelope` (weapons: the locked ship's range, the launch envelope for how it moves, and the
 * range still to close), `salvoTally` (weapons: missiles launched under the engagement, those still
 * in flight, and the missiles left in the magazine), `lostLock` (weapons: the ship the lock held at the
 * previous decision and has lost), `lostContact` (signals: the enemy ship the radar showed at the
 * previous decision and shows no more, and its last world bearing), `salvoOrder` (captain: the
 * missiles a salvo keeps in flight), `focusOrder` (captain: the enemy ships in sight in the order to
 * fight them, nearest the most threatened allied station first when one is in sight), `allyAtRisk`
 * (weapons: the ally the targeting panel's check-fire line shows, its range, and whether it is in the
 * line of fire or by the target), `guardOrder` (captain: the centre of the allied stations in sight, its
 * distance and world bearing).
 */
export const calloutFills = [
    'lockedOffNose',
    'gunSkew',
    'farContact',
    'enemyContact',
    'closeOrder',
    'gunCloseOrder',
    'engageOrder',
    'dockOrder',
    'patrolOrder',
    'lockedTarget',
    'lockedEnvelope',
    'salvoTally',
    'lostLock',
    'lostContact',
    'salvoOrder',
    'focusOrder',
    'allyAtRisk',
    'guardOrder',
] as const;
export type CalloutFill = (typeof calloutFills)[number];

const calloutsSchema = z.record(
    z.string().refine((k) => k !== 'silence', 'silence is always an option'),
    z.object({ say: z.string(), when: z.string(), fill: z.enum(calloutFills).optional() }).strict(),
);

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
                        /**
                         * The what-if plug-in (`whatif/`) that predicts, from this station's display
                         * alone, what each option of this control leads to; the prediction is appended
                         * to the option's description.
                         */
                        whatIf: z.enum(whatIfNames).optional(),
                    })
                    .strict(),
            )
            .default({}),
        /**
         * What the model reads: `display`, the panels and radar as the console's data, or `verbal`,
         * the same display read out as sentences by `verbal.ts` (`console` in the state).
         */
        view: z.enum(['display', 'verbal']).default('display'),
        /**
         * Reads the targeting panel's check-fire line (`allyInLine`, `allyNearTarget`): allies the next
         * round would cross or the blast at the lock would catch. Absent, the brain reads the panel without it.
         */
        checkFire: z.boolean().optional(),
        /**
         * Weapons: the chain-gun shell types in the order the reference rules prefer to load them (`HiExpShell`,
         * `FragShell`, `ArmPenShell`): the gun is changed to the first one with stock. Absent, it changes
         * only once the loaded type ran dry.
         */
        shellPreference: z.array(z.string()).optional(),
        /** Engineer: which defects the reference rules queue a field repair for, the reactor's only (absent), any system's, or any system's with the magazine's capacity first. */
        repairs: z.enum(['reactor', 'all', 'magazine', 'magazine-retry']).optional(),
        /** Weapons: the reference rules fire the chain gun only at a locked target this close, metres; absent, the gun's own reach. */
        fireRangeMeters: z.number().positive().optional(),
        /**
         * Captain: the reference rules close on and focus by the station the most enemies close on, not the one
         * an enemy is nearest to, and keep that station and its target until another clearly takes over (see `ThreatPick`).
         */
        threatTarget: z.boolean().optional(),
        /** Captain: with no enemy in sight, the reference rules send the ship to the centre of the allied stations in sight instead of holding where it is. */
        guardCentre: z.boolean().optional(),
        /** Helms: the reference rules park off the gun line of an allied station behind or before the target, so weapons need not hold fire on it. */
        clearLine: z.boolean().optional(),
        /** Captain and weapons: how the shell stock is judged and when an enemy keeps the ship from docking to restock (see `Resupply`). */
        resupply: z
            .object({
                byCapacity: z.boolean().optional(),
                dockClearMeters: z.number().positive().optional(),
                lowShare: z.number().positive().max(1).optional(),
                restockedShare: z.number().positive().max(1).optional(),
            })
            .strict()
            .optional(),
        /** Display paths (`panels.<widget>` or `radar`) left out of the state the model reads. */
        hide: z.array(z.string()).default([]),
        /**
         * Crew talk: the fixed phrases this station may say on the crew channel, keyed by option name.
         * `say` is the phrase the other seats hear; `when` describes what saying it tells the crew and
         * "choose this when ...". With callouts, every decision asks one more question, `callout`, over
         * these options and `silence` (wording override: `controls.callout.instructions`).
         * With `fill`, `say` is a template whose `{placeholders}` code fills from this
         * station's own display when the callout is said; a display that does not show the value says
         * nothing.
         */
        callouts: calloutsSchema.optional(),
        /**
         * A fused brain, playing a multiplexed station (`tactical`: helms and weapons), names its
         * member seats here. Every decision and command it makes is tagged with the seat that owns it,
         * and what one seat needs from another is never implicit: a seat's `callouts` are asked as the
         * question `callout:<seat>` and said on the crew channel as that seat, so the brain hears them
         * at its next decision exactly as the separate seat would (`hears: ["weapons.target_locked"]`),
         * and the fused brain splits back into per-seat brains along these lines.
         */
        seats: z.record(z.string(), z.object({ callouts: calloutsSchema.optional() }).strict()).optional(),
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
