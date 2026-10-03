import { Heard, Said } from '../brain/callout';

/** One thing a seat said on the crew channel, at a crew time in seconds. */
type Callout = Said & { speaker: string; at: number };

type ChannelOptions = {
    /** How long a callout stays in what the other seats hear. */
    heardSeconds?: number;
    /** A seat repeating the same phrase within this many seconds is not put on the air. */
    repeatSeconds?: number;
};

/**
 * The crew's radio for one run, in memory, publish and subscribe: a seat says one of its callouts, every
 * other seat hears what was said in the last few seconds, and each listener's brain decides per
 * decision which callouts matter (`hears` in its control wording). Radio discipline is in code: the same seat repeating
 * the same phrase within `repeatSeconds` is suppressed, so a brain that keeps choosing a callout
 * does not drown the others.
 */
export function crewChannel({ heardSeconds = 5, repeatSeconds = 10 }: ChannelOptions = {}) {
    let log: Callout[] = [];
    return {
        /** Puts a callout on the air at `at`; false when it was suppressed as a repeat. */
        say(speaker: string, { callout, phrase }: Said, at: number): boolean {
            log = log.filter((c) => at - c.at <= Math.max(heardSeconds, repeatSeconds));
            if (log.some((c) => c.speaker === speaker && c.phrase === phrase && at - c.at < repeatSeconds)) {
                return false;
            }
            log.push({ speaker, callout, phrase, at });
            return true;
        },
        /** What `listener` hears at `at`: the other seats' callouts of the last `heardSeconds`, oldest first. */
        heard(listener: string, at: number): Heard[] {
            return log
                .filter((c) => c.speaker !== listener && c.at <= at && at - c.at <= heardSeconds)
                .map((c) => ({ speaker: c.speaker, callout: c.callout, phrase: c.phrase, secondsAgo: at - c.at }));
        },
    };
}

export type CrewChannel = ReturnType<typeof crewChannel>;
