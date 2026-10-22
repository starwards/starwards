export enum ScanLevel {
    /** Unknown - physics only. */
    UFO = 0,
    /** Faction + model. */
    BASIC = 1,
    /** Full intel (design, armor, systems, damage), frozen at the moment line-of-sight was lost. */
    SNAPSHOT = 2,
    /** Full intel (design, armor, systems, damage), live. */
    FULL = 3,
}
