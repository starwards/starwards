import { BrainSpec, brainSpecSchema } from './brain/spec';

import { REFERENCE_HELMS, makeReferencePolicy } from './brain/reference-policy';
import { Policy } from './brain/brain';
import { REFERENCE_ENGINEER } from './brain/reference-engineer';
import captain from './brains/captain.v1.json';
import guardCaptain from './brains/captain.v17.json';
import guardSignals from './brains/signals.v10.json';
import guardWeapons from './brains/weapons.v20.json';
import engineer from './brains/engineer.v1.json';
import helms from './brains/helms.v1.json';
import signals from './brains/signals.v1.json';
import tactical from './brains/tactical.v1.json';
import weapons from './brains/weapons.v1.json';
import { withOrderBoard } from './brain/order-executors';

/** One seat of a crew: a station, the brain that plays it, and what answers its questions. */
export type SeatPlan = { station: string; spec: BrainSpec; policy: Policy };

const referenceBrains: Record<string, unknown> = { helms, weapons, engineer, signals, tactical, captain };

/**
 * Seats only a bot takes, by the screen each one reads. The captain reads the whole fleet picture on
 * the dradis and gives orders as callouts, which land on the order board; none of the dradis's waypoint commands is a button a brain
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
        policy: withOrderBoard(
            makeReferencePolicy(
                spec.decisionSeconds,
                spec.repairs && { ...REFERENCE_ENGINEER, repair: spec.repairs },
                'reference',
                spec.clearLine || spec.parkOnEngaged
                    ? {
                          ...REFERENCE_HELMS,
                          ...(spec.clearLine ? { clearLine: true } : {}),
                          ...(spec.parkOnEngaged ? { parkOnEngaged: true } : {}),
                      }
                    : undefined,
                spec.shellPreference,
                spec.fireRangeMeters,
                spec.resupply,
                spec.threatTarget === true,
                spec.guardCentre === true,
            ),
            spec.station,
        ),
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

/**
 * The guard crew's brains, where they differ from the v1 reference: the crew the depth meter plays
 * as its `guard` arm (`modules/ai/crews/captain-reference-guard.json`) and the GM seats live.
 */
const guardBrains: Record<string, unknown> = { captain: guardCaptain, signals: guardSignals, weapons: guardWeapons };

/** The guard crew's seat for a station: its guard brain, else the station's v1 reference brain. */
export function guardSeatPlan(station: string): SeatPlan {
    const raw = guardBrains[station];
    return raw ? referenceSeat(brainSpecSchema.parse(raw)) : referenceSeatPlan(station);
}
