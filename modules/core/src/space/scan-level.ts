export enum ScanLevel {
    UFO = 0, // Unknown - physics only
    BASIC = 1, // Faction + model
    ADVANCED = 2, // Full intel (systems, damage)
}

export interface ScanLevelData {
    targetId: string;
    faction: string;
    currentLevel: ScanLevel;
    timestamp: number; // When level was achieved
}
