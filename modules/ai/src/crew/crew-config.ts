import * as fs from 'node:fs';
import * as path from 'node:path';

import { ENGINEER_POLICIES, makeEngineerPolicy } from '../brain/engineer-policies';
import { HELMS_POLICIES, HelmsPolicyName, makeHelmsPolicy } from '../brain/helms-policies';
import { JevUsage, answerCacheFromEnv, meteredJevClient } from '../brain/jev-cache';
import { SCRIPTED_SEAT_POLICIES, makeScriptedSeatPolicy } from '../brain/weapons-policies';
import { idlePolicy, jevPolicy } from '../brain/policies';

import { Policy } from '../brain/brain';
import { SeatPlan } from './crew';
import { jevClient } from '../brain/jev-client';
import { loadBrainSpec } from '../brain/spec';
import { makeReferencePolicy } from '../brain/reference-policy';
import { z } from 'zod';

/** Where the module's own brains live; a crew file names others by a path relative to itself. */
const BRAINS_DIR = path.resolve(__dirname, '../../brains');

const crewConfigSchema = z
    .object({
        name: z.string(),
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
                    /** Brain file; defaults to the module's `<station>.v1.json`. */
                    brain: z.string().optional(),
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
        seats: config.seats.map(({ station, policy, brain }) => ({
            station,
            policy,
            brainPath: brain
                ? path.resolve(path.dirname(filePath), brain)
                : path.join(BRAINS_DIR, `${station}.v1.json`),
        })),
    };
}

/** `jevUsage` counts what the crew's Jev seats ask from now on; absent for a crew without one. */
type CrewPlan = { name: string; seats: SeatPlan[]; usesJev: boolean; jevUsage?: JevUsage };

/**
 * Reads a crew file and builds its seats. A Jev seat needs `TYPESAFE_API_KEY`; the client is shared
 * by every seat of the crew so the per-process rate limit covers all of them, and answers from the
 * answer cache the environment names.
 */
export function loadCrew(filePath: string, jevRequestsPerMinute?: number): CrewPlan {
    const config = readCrewFile(filePath);
    const usesJev = config.seats.some((s) => s.policy === 'jev');
    const client = usesJev
        ? meteredJevClient(jevClient({ requestsPerMinute: jevRequestsPerMinute }), answerCacheFromEnv())
        : undefined;
    const seats = config.seats.map((seat) => {
        const spec = loadBrainSpec(seat.brainPath);
        if (spec.station !== seat.station) {
            throw new Error(`crew ${config.name}: brain ${spec.id} plays ${spec.station}, not ${seat.station}`);
        }
        const policy: Policy =
            seat.policy === 'jev'
                ? jevPolicy(spec, client!)
                : seat.policy === 'reference'
                  ? makeReferencePolicy(spec.decisionSeconds)
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
        return { station: seat.station, spec, policy };
    });
    return { name: config.name, seats, usesJev, jevUsage: client?.usage };
}
