import { NpcAiProfile, TODAY_NPC_AI } from './npc-ai-profile';
import { FlightDoctrine } from './flight-doctrine';

function doctrine(
    name: string,
    flightDoctrine: FlightDoctrine,
    aggro: NonNullable<NpcAiProfile['aggro']>,
): NpcAiProfile {
    return { ...TODAY_NPC_AI, name, flightDoctrine, aggro };
}

/**
 * The named fighting styles NPCs are given, as {@link NpcAiProfile}s (keyed by their `name`). Wave
 * archetypes reference them by key. Server-side only: a doctrine is never a `@gameField` and never
 * shows in a scan.
 */
export const npcDoctrines = {
    /** Closes range, turns on whoever hurts it. */
    rush: doctrine('rush', FlightDoctrine.INTERCEPT, 'Brawler'),
    /** Sits in its guns envelope, turns on whoever hurts it. */
    holdRange: doctrine('holdRange', FlightDoctrine.STANDOFF, 'Brawler'),
    /** Tracks a target at 1-3 km and builds a grudge against any hostile in reach. */
    shadowPlayer: doctrine('shadowPlayer', FlightDoctrine.SHADOW, 'Hunter'),
    /** Tracks the heavy it escorts, turns on whoever hurts it. */
    shadowEscort: doctrine('shadowEscort', FlightDoctrine.SHADOW, 'Brawler'),
} as const satisfies Record<string, NpcAiProfile>;

export type NpcDoctrineName = keyof typeof npcDoctrines;
