import { FlightDoctrine, NpcAiProfile, ShipState, TODAY_NPC_AI, npcDifficultyPresets } from '@starwards/core/internal';

/**
 * One way an NPC raider can be varied while the crew stays fixed (the adversary rungs, M4.65 / S0 of
 * the NPC AI design). Every field is a lever the game already has; a profile adds none, and the
 * default profile changes nothing.
 */
export interface AdversaryProfile {
    readonly name: string;
    readonly description: string;
    /** The AI the raider flies; its `flightDoctrine`, when not `AUTO`, overrides whatever the order or the map gave it. */
    readonly ai: NpcAiProfile;
    /** Single-raider rungs only: the raider holds its position and fires instead of attacking. */
    readonly standGround?: boolean;
}

export const adversaryProfiles: Readonly<Record<string, AdversaryProfile>> = {
    today: {
        name: 'today',
        description: 'the raider exactly as the rung builds it (an ATTACK order flies STANDOFF)',
        ai: TODAY_NPC_AI,
    },
    intercept: {
        name: 'intercept',
        description: 'flight doctrine INTERCEPT: hull heading serves the guns',
        ai: { ...TODAY_NPC_AI, flightDoctrine: FlightDoctrine.INTERCEPT },
    },
    standoff: {
        name: 'standoff',
        description: 'flight doctrine STANDOFF: holds the guns envelope, heading serves thrust',
        ai: { ...TODAY_NPC_AI, flightDoctrine: FlightDoctrine.STANDOFF },
    },
    shadow: {
        name: 'shadow',
        description: 'flight doctrine SHADOW: tracks at 1-3 km, ignores gunnery',
        ai: { ...TODAY_NPC_AI, flightDoctrine: FlightDoctrine.SHADOW },
    },
    noweave: {
        name: 'noweave',
        description: 'attacks without its combat weave',
        ai: { ...TODAY_NPC_AI, noCombatWeave: true },
    },
    ...Object.fromEntries(
        Object.entries(npcDifficultyPresets).map(([key, ai]) => [
            key,
            {
                name: key,
                description: `difficulty ${key}: faction-FOV and scan-level perception, AI decisions every ${ai.aiTickRatio} tick(s)`,
                ai,
            },
        ]),
    ),
    standground: {
        name: 'standground',
        description: 'holds its position and fires (single-raider rungs only)',
        ai: TODAY_NPC_AI,
        standGround: true,
    },
};

/** The profiles a wave rung can apply: it has no single raider to hold ground. */
export const waveAdversaryProfiles = Object.values(adversaryProfiles).filter((p) => !p.standGround);

/** Applies the per-ship levers of `profile` to one raider's state. */
export function applyAdversaryProfile(state: ShipState, profile: AdversaryProfile): void {
    state.aiProfile = profile.ai;
    if (profile.ai.flightDoctrine !== FlightDoctrine.AUTO) {
        state.flightDoctrine = profile.ai.flightDoctrine;
    }
}
