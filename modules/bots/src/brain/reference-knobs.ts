/**
 * The reference crew's numeric thresholds, gathered so a parameter search (modules/ai `search`) can
 * set them per run. Production plays {@link REFERENCE_KNOB_DEFAULTS}; nothing outside a search
 * harness calls {@link setReferenceKnobs}.
 */
export const REFERENCE_KNOB_DEFAULTS = {
    /** Weapons fires the gun while the target is within this many degrees of the nose. */
    FIRE_ARC_DEGREES: 2,
    /** Weapons launches at most one missile per this many seconds. */
    LAUNCH_INTERVAL_SECONDS: 10,
    /** Helms parks this far from an enemy. */
    STANDOFF_METERS: 500,
    /** Helms parks this far from an enemy while a missile can be launched at it. */
    ARMED_STANDOFF_METERS: 4000,
    /** Amplitude of helms' combat weave. */
    WEAVE_METERS: 400,
    /** Frequency of helms' combat weave. */
    WEAVE_HZ: 0.08,
    /** Helms flies at speed beyond this much past its standoff, else parks. */
    PURSUIT_METERS: 1500,
    /** Clearance helms and weapons keep the gun line off an allied station's hull. */
    LINE_CLEARANCE_METERS: 600,
    /** Weapons holds fire while a chain gun is hotter than this. */
    GUN_HOLD_HEAT: 85,
    /** Proportional gain of helms' parking. */
    PARKING_GAIN: 0.3,
    /** Captain refocuses on a nearer station threat only after the held one is this much farther. */
    REFOCUS_MARGIN_METERS: 5000,
    /** Captain keeps a focus while an enemy is within this of the held station. */
    STATION_HELD_METERS: 10_000,
    /** Captain keeps a focus at least this long after an enemy was near the held station. */
    STATION_HELD_SECONDS: 30,
    /** Captain sends the ship to restock below this share of shells. */
    SHELLS_LOW: 0.4,
    /** Captain orders the guard move when the ship is farther than this from the stations' centre. */
    GUARD_SLACK_METERS: 3000,
    /** Captain counts an enemy within this of a station as attacking it. */
    ATTACK_METERS: 20_000,
    /** Captain switches target only to an enemy this much nearer the station. */
    RETARGET_MARGIN_METERS: 3000,
    /** Captain keeps its order this long after a contact is reported lost. */
    CONTACT_LOST_HOLD_SECONDS: 15,
    /** Engineer lowers a chain gun's power at this heat. */
    GUN_BACKOFF_HEAT: 60,
    /** Engineer restores a chain gun's power below this heat. */
    GUN_RELEASE_HEAT: 40,
    /** Engineer queues repairs while the energy store is above this share. */
    REPAIR_STORE: 0.3,
    /** Helms closes to missile range minus this margin. */
    CLOSE_MARGIN_METERS: 2000,
    /** Weapons fires the gun only at a target this near (gravitas' fuse reaches 8000 m), or one near a station. */
    FIRE_RANGE_METERS: 8000,
    /** Weapons fires past its range or its shell budget at a target this near an allied station. */
    STATION_GUARD_METERS: 0,
    /** Share of the first-seen HE and AP shells weapons may spend before `SHELL_BUDGET_SECONDS`. */
    WAVE_SHELL_BUDGET: 1,
    /** Seconds the shell budget holds. */
    SHELL_BUDGET_SECONDS: 690,
    /** Weapons keeps its lock against an engage order once it fired this long at it; 0 follows every order. */
    FINISH_LOCK_SECONDS: 0,
    /** The gun prefers Frag, then HE, then AP shells until this many seconds; 0 never prefers Frag. */
    FRAG_FIRST_SECONDS: 0,
    /** Weapons launches no missile that would leave fewer than this many of its type before `MISSILE_RESERVE_SECONDS`; 0 never holds. */
    MISSILE_RESERVE: 0,
    /** Seconds the missile reserve holds. */
    MISSILE_RESERVE_SECONDS: 690,
    /** Above 0.5, weapons switches an empty tube to the next missile type with stock (HE, AP, Frag); else tubes keep their type. */
    TUBE_AMMO_FALLBACK: 0,
    /** Weapons launches a missile only once its gun fired this many seconds at the current lock; 0 launches at once. */
    MISSILE_ESCALATE_SECONDS: 0,
    /** Above 0.5 (with `TUBE_AMMO_FALLBACK`), tubes load AP missiles first, then HE, then Frag. */
    TUBE_AMMO_AP_FIRST: 0,
    /** Captain says no close order at an enemy nearer than this; 0 always may (branch sweep: closing in at gun range lost seeds). */
    CLOSE_STOP_METERS: 0,
};

export type ReferenceKnobs = typeof REFERENCE_KNOB_DEFAULTS;

/** The knobs the reference crew reads right now. */
export const referenceKnobs: ReferenceKnobs = { ...REFERENCE_KNOB_DEFAULTS };

/** Sets the knobs for the next runs: the defaults, overridden by `overrides`. */
export function setReferenceKnobs(overrides: Partial<ReferenceKnobs> = {}) {
    for (const key of Object.keys(overrides)) {
        if (!(key in REFERENCE_KNOB_DEFAULTS)) throw new Error(`unknown reference knob ${key}`);
    }
    Object.assign(referenceKnobs, REFERENCE_KNOB_DEFAULTS, overrides);
}
