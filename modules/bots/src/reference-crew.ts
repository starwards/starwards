import { BrainSpec, brainSpecSchema } from './brain/spec';

import { Policy } from './brain/brain';
import engineer from './brains/engineer.v1.json';
import helms from './brains/helms.v1.json';
import { makeReferencePolicy } from './brain/reference-policy';
import signals from './brains/signals.v1.json';
import tactical from './brains/tactical.v1.json';
import weapons from './brains/weapons.v1.json';

/** One seat of a crew: a station, the brain that plays it, and what answers its questions. */
export type SeatPlan = { station: string; spec: BrainSpec; policy: Policy };

const referenceBrains: Record<string, unknown> = { helms, weapons, engineer, signals, tactical };

/** Where the reference brain files live, for crew files that name them by path. */
export const REFERENCE_BRAINS_DIR = `${__dirname}/brains`;

/** The rule-based reference brain for a station, as the live bots and the headless curriculum both play it. */
export function referenceSeatPlan(station: string): SeatPlan {
    const raw = referenceBrains[station];
    if (!raw) {
        throw new Error(`no reference brain for station "${station}"`);
    }
    const spec = brainSpecSchema.parse(raw);
    return { station, spec, policy: makeReferencePolicy(spec.decisionSeconds) };
}
