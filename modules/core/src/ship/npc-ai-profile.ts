import { AggroCharacterName } from './threat-table';
import { FlightDoctrine } from './flight-doctrine';

/**
 * The data that drives one NPC ship's AI: doctrine and difficulty knobs, as fields rather than
 * constants. Server-side only, never synced: doctrine is hidden from player-facing state.
 * Heat thresholds are fractions of `MAX_SYSTEM_HEAT`.
 */
export type NpcPerception = 'exact' | 'faction';

export interface NpcAiProfile {
    readonly name: string;
    /** Overrides the ship's flight doctrine; `AUTO` keeps whatever the order or the map gave it. */
    readonly flightDoctrine: FlightDoctrine;
    /** The aggro character wave spawning gives the ship (re-weighted per hull); `null`: no aggro, the ship never leaves its order. */
    readonly aggro: AggroCharacterName | null;
    /** Attack without the combat weave (calibration only; no real game sets it). */
    readonly noCombatWeave: boolean;
    /** Amplitude of the lateral weave overlaid on attack-order steering. */
    readonly weaveAmplitudeMeters: number;
    /** Frequency of the lateral weave. */
    readonly weaveFrequencyHz: number;
    /** How often an NPC with no ordered or cached target re-scans for a hostile to fire on. */
    readonly gunneryRescanIntervalSeconds: number;
    /** How often NPC automation re-derives `coolantFactor` for every system. */
    readonly coolantReallocationIntervalSeconds: number;
    /** Gun heat at which power backs off from `NORMAL` to `LOW`. */
    readonly powerBackoffEngageHeat: number;
    /** Gun heat the mount must cool below before power backoff releases. */
    readonly powerBackoffReleaseHeat: number;
    /**
     * What the NPC believes about other ships. `exact`: every live hostile, omniscient (the test
     * profile specs and the harness reference rely on). `faction`: only hostiles its own faction
     * holds in field of view and has scanned to at least `BASIC`.
     */
    readonly perception: NpcPerception;
    /**
     * The AI decision layer (perceiving and choosing targets) runs on every Nth tick; physics and
     * execution run every tick. 1 is every tick (Hard); a higher ratio slows the AI's thinking.
     */
    readonly aiTickRatio: number;
    /** Reserved, not yet consumed: degrees of random aim error added to every shot. 0 is perfect aim. */
    readonly aimErrorDegrees: number;
    /** Reserved, not yet consumed: seconds before an NPC notices damage worth repairing. 0 is at once. */
    readonly repairNoticingDelaySeconds: number;
    /** Reserved, not yet consumed: share of a group's guns that concentrate on one target. 0 is no coordination. */
    readonly focusFireShare: number;
    /** Reserved, not yet consumed: hull fraction below which the NPC disengages. 0 is never. */
    readonly retreatHullFraction: number;
}

/** The AI every NPC has always had; the default profile: exact perception, decisions every tick (Hard's ratio). */
export const TODAY_NPC_AI: NpcAiProfile = {
    name: 'today',
    flightDoctrine: FlightDoctrine.AUTO,
    aggro: null,
    noCombatWeave: false,
    weaveAmplitudeMeters: 400,
    weaveFrequencyHz: 0.08,
    gunneryRescanIntervalSeconds: 1,
    coolantReallocationIntervalSeconds: 0.5,
    powerBackoffEngageHeat: 0.6,
    powerBackoffReleaseHeat: 0.4,
    perception: 'exact',
    aiTickRatio: 1,
    aimErrorDegrees: 0,
    repairNoticingDelaySeconds: 0,
    focusFireShare: 0,
    retreatHullFraction: 0,
};

/** Perceives through its faction's field of view and scan levels, decides every tick. */
export const HARD_NPC_AI: NpcAiProfile = { ...TODAY_NPC_AI, name: 'hard', perception: 'faction', aiTickRatio: 1 };

/** Placeholder ratios: calibrated against the wave rung's guard pass rate as a separate data job. */
export const npcDifficultyPresets = {
    hard: HARD_NPC_AI,
    normal: { ...HARD_NPC_AI, name: 'normal', aiTickRatio: 4 },
    easy: { ...HARD_NPC_AI, name: 'easy', aiTickRatio: 10 },
} as const satisfies Record<string, NpcAiProfile>;

export type NpcDifficultyName = keyof typeof npcDifficultyPresets;
