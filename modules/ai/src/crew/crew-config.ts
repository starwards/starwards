import * as fs from 'node:fs';
import * as path from 'node:path';

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
                    policy: z.enum(['jev', 'reference', 'idle']),
                    /** Brain file; defaults to the module's `<station>.v1.json`. */
                    brain: z.string().optional(),
                })
                .strict(),
        ),
    })
    .strict();

type CrewPlan = { name: string; seats: SeatPlan[]; usesJev: boolean };

/**
 * Reads a crew file and builds its seats. A Jev seat needs `TYPESAFE_API_KEY`; the client is shared
 * by every seat of the crew so the per-process rate limit covers all of them.
 */
export function loadCrew(filePath: string, jevRequestsPerMinute?: number): CrewPlan {
    const config = crewConfigSchema.parse(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    const usesJev = config.seats.some((s) => s.policy === 'jev');
    const client = usesJev ? jevClient({ requestsPerMinute: jevRequestsPerMinute }) : undefined;
    const seats = config.seats.map((seat) => {
        const spec = loadBrainSpec(
            seat.brain
                ? path.resolve(path.dirname(filePath), seat.brain)
                : path.join(BRAINS_DIR, `${seat.station}.v1.json`),
        );
        if (spec.station !== seat.station) {
            throw new Error(`crew ${config.name}: brain ${spec.id} plays ${spec.station}, not ${seat.station}`);
        }
        const policy: Policy =
            seat.policy === 'jev'
                ? jevPolicy(spec, client!)
                : seat.policy === 'reference'
                  ? makeReferencePolicy(spec.decisionSeconds)
                  : idlePolicy;
        return { station: seat.station, spec, policy };
    });
    return { name: config.name, seats, usesJev };
}
