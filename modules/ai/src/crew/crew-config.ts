import * as fs from 'node:fs';
import * as path from 'node:path';

import {
    ENGINEER_POLICIES,
    HELMS_POLICIES,
    HelmsPolicyName,
    Policy,
    REFERENCE_BRAINS_DIR,
    SCRIPTED_SEAT_POLICIES,
    loadBrainSpec,
    makeEngineerPolicy,
    makeHelmsPolicy,
    makeScriptedSeatPolicy,
    referenceSeat,
    setReferenceKnobs,
} from '@starwards/bots';
import { JevUsage, answerCacheFromEnv, meteredJevClient } from '../brain/jev-cache';
import { idlePolicy, jevPolicy } from '../brain/policies';

import { CrewSeatPlan } from './crew';
import { jevClient } from '../brain/jev-client';
import { z } from 'zod';

const crewConfigSchema = z
    .object({
        name: z.string(),
        /** The crew's doctrine fills every board slot no captain order holds (`crewDoctrine` in `@starwards/bots`). */
        doctrine: z.boolean().optional(),
        /** Overrides of the reference seats' numeric knobs (`REFERENCE_KNOB_DEFAULTS` in `@starwards/bots`), set by `search`. */
        knobs: z.record(z.string(), z.number()).optional(),
        seats: z.array(
            z
                .object({
                    station: z.string(),
                    /**
                     * The `ENGINEER_POLICIES`, `HELMS_POLICIES` and `SCRIPTED_SEAT_POLICIES` are scripted
                     * seats for validating the engineer, helms, weapons and tactical scores.
                     */
                    policy: z.enum([
                        'jev',
                        'reference',
                        'idle',
                        ...ENGINEER_POLICIES,
                        ...HELMS_POLICIES,
                        ...SCRIPTED_SEAT_POLICIES,
                    ]),
                    /** Brain file, relative to the crew file; defaults to the station's reference brain, `<station>.v1.json` in `@starwards/bots`. */
                    brain: z.string().optional(),
                    /** Seconds the seat's first decision waits, shifting its cadence (`CrewSeatPlan`). */
                    phaseSeconds: z.number().min(0).optional(),
                })
                .strict(),
        ),
    })
    .strict();

/** A crew file as written, with every seat's brain file resolved to an absolute path. */
export function readCrewFile(filePath: string) {
    const config = crewConfigSchema.parse(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    return {
        name: config.name,
        doctrine: config.doctrine === true,
        knobs: config.knobs ?? {},
        seats: config.seats.map(({ station, policy, brain, phaseSeconds }) => ({
            station,
            policy,
            phaseSeconds,
            brainPath: brain
                ? path.resolve(path.dirname(filePath), brain)
                : path.join(REFERENCE_BRAINS_DIR, `${station}.v1.json`),
        })),
    };
}

/** `jevUsage` counts what the crew's Jev seats ask from now on; absent for a crew without one. */
type CrewPlan = { name: string; doctrine: boolean; seats: CrewSeatPlan[]; usesJev: boolean; jevUsage?: JevUsage };

/**
 * Reads a crew file and builds its seats. A Jev seat needs `TYPESAFE_API_KEY`; the client is shared
 * by every seat of the crew so the per-process rate limit covers all of them, and answers from the
 * answer cache the environment names.
 */
export function loadCrew(filePath: string, jevRequestsPerMinute?: number): CrewPlan {
    const config = readCrewFile(filePath);
    // the reference seats read the knobs as they are built and as they play: every run sets them anew
    setReferenceKnobs(config.knobs);
    const usesJev = config.seats.some((s) => s.policy === 'jev');
    const client = usesJev
        ? meteredJevClient(jevClient({ requestsPerMinute: jevRequestsPerMinute }), answerCacheFromEnv())
        : undefined;
    const seats = config.seats.map((seat) => {
        const spec = loadBrainSpec(seat.brainPath);
        if (spec.station !== seat.station) {
            throw new Error(`crew ${config.name}: brain ${spec.id} plays ${spec.station}, not ${seat.station}`);
        }
        if (seat.policy === 'reference') {
            const docks = Object.entries(config.knobs).filter(
                ([knob, value]) => /^(DOCK_LOSING_(STATION_HP|ATTACK_SECONDS)|RESTOCK_FROM_SECONDS)$/.test(knob) && value > 0,
            );
            if (spec.station === 'captain' && docks.length && !('dock_for_repair' in (spec.callouts ?? {}))) {
                throw new Error(
                    `crew ${config.name}: knob ${docks[0][0]} needs a captain brain that says dock_for_repair; ${spec.id} cannot`,
                );
            }
            return { ...referenceSeat(spec), phaseSeconds: seat.phaseSeconds };
        }
        const policy: Policy =
            seat.policy === 'jev'
                ? jevPolicy(spec, client!)
                : seat.policy === 'idle'
                  ? idlePolicy
                  : (HELMS_POLICIES as readonly string[]).includes(seat.policy)
                    ? makeHelmsPolicy(seat.policy as HelmsPolicyName, spec.decisionSeconds)
                    : (SCRIPTED_SEAT_POLICIES as readonly string[]).includes(seat.policy)
                      ? makeScriptedSeatPolicy(
                            seat.policy as (typeof SCRIPTED_SEAT_POLICIES)[number],
                            spec.decisionSeconds,
                        )
                      : makeEngineerPolicy(seat.policy as (typeof ENGINEER_POLICIES)[number], spec.decisionSeconds);
        return { station: seat.station, spec, policy, phaseSeconds: seat.phaseSeconds };
    });
    return { name: config.name, doctrine: config.doctrine, seats, usesJev, jevUsage: client?.usage };
}
