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
    /** Weapons holds fire once a chain gun's heat is within this of its jam bar. */
    GUN_JAM_MARGIN: 5,
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
    /**
     * AP opens, HE finishes: above 0.5 the gun loads AP shells while the lock's plates are judged
     * intact and HE once judged broken; above 1.5 the tubes re-type unloaded tubes the same way.
     * Weapons cannot see target plates, so "broken" is its own tally: `AMMO_OPEN_AP_SHELLS` AP shells
     * or one AP missile spent on the current lock.
     */
    AMMO_OPEN_AP: 0,
    /**
     * Informed arm: above 0.5 the gun loads AP shells while the lock's facing armor plates hold and HE once
     * they are broken (AP against whipple), from the plate state Signals calls out of Target Details
     * (`plate_intel`); AP without a call. Above 1.5 the tubes re-type unloaded tubes the same way.
     * Replaces `AMMO_OPEN_AP`, the blind arm, whose tally stands in for plates weapons cannot see.
     */
    AMMO_INFORMED: 0,
    /** Pure arm: above 0.5 the gun loads HE shells only (AP, Frag after them); above 1.5 the tubes load HE missiles first. */
    AMMO_HE_ONLY: 0,
    /** Pure arm: above 0.5 the gun loads AP shells only (HE, Frag after them); above 1.5 the tubes load AP missiles first. */
    AMMO_AP_ONLY: 0,
    /** AP shells weapons spends on a lock before judging its plates broken (`AMMO_OPEN_AP`). */
    AMMO_OPEN_AP_SHELLS: 24,
    /** Weapons launches a missile only at a lock within this many meters of an allied station; 0 at any lock. */
    MISSILE_STATION_METERS: 0,
    /** Weapons launches no missile at a lock its gun already fired this many seconds at (left to the gun to finish); 0 never skips. */
    MISSILE_FINISH_SECONDS: 0,
    /** Captain says no close order at an enemy nearer than this; 0 always may (branch sweep: closing in at gun range lost seeds). */
    CLOSE_STOP_METERS: 0,
    /**
     * Losing → hold: from `LOSING_AFTER_SECONDS` on, the captain holds instead of closing while an enemy
     * was within `ATTACK_METERS` of an allied station for at least this many of the last 60 s, or while
     * at least `LOSING_ENEMIES` enemies are in sight; 0 never.
     */
    LOSING_ATTACK_SECONDS: 0,
    /** Enemies in sight at which the losing → hold rule holds (with `LOSING_ATTACK_SECONDS` on); 0 never on count. */
    LOSING_ENEMIES: 0,
    /** Seconds into the fight before the losing → hold rule may hold. */
    LOSING_AFTER_SECONDS: 450,
    /**
     * Restock window: from this many seconds the captain docks once to restock (no shells-low call
     * needed) while no enemy is within `RESTOCK_CLEAR_METERS`, and casts off by `RESTOCK_UNTIL_SECONDS`;
     * 0 never.
     */
    RESTOCK_FROM_SECONDS: 0,
    /** The captain casts off a restock-window dock by this time, whatever the stock. */
    RESTOCK_UNTIL_SECONDS: 0,
    /** An enemy this near keeps the captain from a restock-window dock and sends it off one. */
    RESTOCK_CLEAR_METERS: 30_000,
    /**
     * Conditional restock: above 0, the restock-window dock goes ahead only while the magazine capacity
     * the engineer last called is below this, or weapons called the shells low; 0 docks regardless.
     */
    RESTOCK_BELOW_CAPACITY: 0,
    /**
     * Losing → dock: from `DOCK_LOSING_AFTER_SECONDS` on, the captain docks once while the allied stations
     * still on the dradis fall below this share of the most it has seen (no seat shows a station's hull,
     * so a lost station is the crew's reading of station damage); 0 never.
     */
    DOCK_LOSING_STATION_HP: 0,
    /**
     * Losing → dock: from `DOCK_LOSING_AFTER_SECONDS` on, the captain docks once after an enemy was within
     * `ATTACK_METERS` of an allied station for at least this many of the last 60 s; 0 never.
     */
    DOCK_LOSING_ATTACK_SECONDS: 0,
    /** Seconds into the fight before the losing → dock rule may dock. */
    DOCK_LOSING_AFTER_SECONDS: 450,
    /**
     * `magazine-first` engineer: from this many seconds (wave 1 over) for `MAGAZINE_FIRST_WINDOW_SECONDS`,
     * and again from `MAGAZINE_FIRST_PRE_DOCK_SECONDS` before `RESTOCK_FROM_SECONDS` until it, a shown
     * magazine defect cancels any other repair so the feed-system overhaul runs first.
     */
    /**
     * Lull → dock (HE restock): between `LULL_DOCK_FROM_SECONDS` and `LULL_DOCK_UNTIL_SECONDS` (waves 2 to 3),
     * the captain docks once while weapons last called at most this many missiles left and no enemy is within
     * `LULL_DOCK_CLEAR_METERS` of an allied station; 0 never.
     */
    LULL_DOCK_MISSILES: 0,
    /** An enemy this near an allied station keeps the captain from a lull dock and sends it off one. */
    LULL_DOCK_CLEAR_METERS: 5000,
    /** Seconds from which a lull dock may happen (wave 2 spawns at 480 s on W-waves). */
    LULL_DOCK_FROM_SECONDS: 480,
    /** Seconds until which a lull dock may happen (wave 3 spawns at 960 s on W-waves). */
    LULL_DOCK_UNTIL_SECONDS: 960,
    /**
     * Docked with its restock done, the captain launches at full speed instead of a gentle undock once an enemy
     * is within this of an allied station; 0 never launches.
     */
    LAUNCH_ON_THREAT_METERS: 0,
    /** How long a lull dock keeps the ship at the station (travel plus the 150 s full restock), unless the lull breaks. */
    LULL_DOCK_HOLD_SECONDS: 210,
    /**
     * Missile target selection: 0 launches at any lock; 1 (kill) only at a lock a salvo likely kills (a hull
     * no wider than `MISSILE_KILL_RADIUS_METERS`, within `MISSILE_KILL_METERS`, too near
     * to outrun the missile); 2 (threat) only at the enemy nearest an allied station.
     */
    MISSILE_TARGET_MODE: 0,
    /** Mode-1 kill estimate: a hull this wide or narrower dies to a salvo (dragonflies 11.2 m, predator 22.4 m). */
    MISSILE_KILL_RADIUS_METERS: 15,
    /** Mode-1 kill estimate: the lock is at most this far (guard launches on W-waves: 8/40 beyond 3 km). */
    MISSILE_KILL_METERS: 3000,
    /**
     * Late stance: from `LATE_STANCE_SECONDS` on, the captain sets a fighting stance once: 1 offensive (guns at
     * full power, the fight ranked first), 2 all out (guns, tubes and thrusters at full power, afterburner onto
     * the enemy); 0 never. Needs a captain brain with the `offensive`/`all_out` callouts.
     */
    LATE_STANCE_MODE: 0,
    /**
     * Seconds from which the late stance is set. W-waves guard 2257-2512 (10th-90th pct): wave 3 spawns at
     * 619-796 s, lost runs end at 1024-1211 s.
     */
    LATE_STANCE_SECONDS: 1020,
    MAGAZINE_FIRST_SECONDS: 300,
    MAGAZINE_FIRST_WINDOW_SECONDS: 60,
    MAGAZINE_FIRST_PRE_DOCK_SECONDS: 90,
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
