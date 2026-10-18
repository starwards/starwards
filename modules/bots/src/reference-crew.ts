import { BrainSpec, brainSpecSchema } from './brain/spec';

import { Policy } from './brain/brain';
import captain from './brains/captain.v1.json';
import engineer from './brains/engineer.v1.json';
import helms from './brains/helms.v1.json';
import { makeReferencePolicy } from './brain/reference-policy';
import signals from './brains/signals.v1.json';
import tactical from './brains/tactical.v1.json';
import weapons from './brains/weapons.v1.json';
import { withOrderBoard } from './brain/order-executors';

/** One seat of a crew: a station, the brain that plays it, and what answers its questions. */
export type SeatPlan = { station: string; spec: BrainSpec; policy: Policy };

const referenceBrains: Record<string, unknown> = { helms, weapons, engineer, signals, tactical, captain };

/**
 * Seats only a bot takes, by the screen each one reads. The captain reads the whole fleet picture on
 * the dradis and gives orders by radio; none of the dradis's waypoint commands is a button a brain
 * presses, so the seat has no controls.
 */
const botSeatScreens: Readonly<Record<string, string>> = { captain: 'dradis' };

/** The station console a bot seat of `station` opens. */
export function botSeatScreen(station: string) {
    return botSeatScreens[station] ?? station;
}

/** Where the reference brain files live, for crew files that name them by path. */
export const REFERENCE_BRAINS_DIR = `${__dirname}/brains`;

/** A seat that plays `spec` with the rule-based reference policy. */
export function referenceSeat(spec: BrainSpec): SeatPlan {
    return {
        station: spec.station,
        spec,
        policy: withOrderBoard(makeReferencePolicy(spec.decisionSeconds), spec.station),
    };
}

/** The rule-based reference brain for a station, as the live bots and the headless curriculum both play it. */
export function referenceSeatPlan(station: string): SeatPlan {
    const raw = referenceBrains[station];
    if (!raw) {
        throw new Error(`no reference brain for station "${station}"`);
    }
    return referenceSeat(brainSpecSchema.parse(raw));
}
