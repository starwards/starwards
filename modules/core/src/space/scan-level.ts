export enum ScanLevel {
    UFO = 0, // Unknown - physics only
    BASIC = 1, // Faction + model
    SNAPSHOT = 2, // Full intel (systems, damage), frozen at the moment line-of-sight was lost
    FULL = 3, // Full intel (systems, damage), live
}
