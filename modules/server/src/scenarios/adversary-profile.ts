import { FlightDoctrine, ShipState } from '@starwards/core/internal';

/**
 * One way an NPC raider can be varied while the crew stays fixed (the adversary rungs, M4.65 / S0 of
 * the NPC AI design). Every field is a lever the game already has; a profile adds none, and the
 * default profile changes nothing.
 */
export interface AdversaryProfile {
    readonly name: string;
    readonly description: string;
    /** Overrides the raider's flight doctrine; absent keeps whatever the order or the map gave it. */
    readonly flightDoctrine?: FlightDoctrine;
    /** The raider attacks without its combat weave (`ShipState.labNoCombatWeave`). */
    readonly noCombatWeave?: boolean;
    /** Single-raider rungs only: the raider holds its position and fires instead of attacking. */
    readonly standGround?: boolean;
}

export const adversaryProfiles: Readonly<Record<string, AdversaryProfile>> = {
    today: { name: 'today', description: 'the raider exactly as the rung builds it (an ATTACK order flies STANDOFF)' },
    intercept: {
        name: 'intercept',
        description: 'flight doctrine INTERCEPT: hull heading serves the guns',
        flightDoctrine: FlightDoctrine.INTERCEPT,
    },
    standoff: {
        name: 'standoff',
        description: 'flight doctrine STANDOFF: holds the guns envelope, heading serves thrust',
        flightDoctrine: FlightDoctrine.STANDOFF,
    },
    shadow: {
        name: 'shadow',
        description: 'flight doctrine SHADOW: tracks at 1-3 km, ignores gunnery',
        flightDoctrine: FlightDoctrine.SHADOW,
    },
    noweave: { name: 'noweave', description: 'attacks without its combat weave', noCombatWeave: true },
    standground: {
        name: 'standground',
        description: 'holds its position and fires (single-raider rungs only)',
        standGround: true,
    },
};

/** The profiles a wave rung can apply: it has no single raider to hold ground. */
export const waveAdversaryProfiles = Object.values(adversaryProfiles).filter((p) => !p.standGround);

/** Applies the per-ship levers of `profile` to one raider's state. */
export function applyAdversaryProfile(state: ShipState, profile: AdversaryProfile): void {
    if (profile.flightDoctrine !== undefined) {
        state.flightDoctrine = profile.flightDoctrine;
    }
    if (profile.noCombatWeave) {
        state.labNoCombatWeave = true;
    }
}
