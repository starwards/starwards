import { Faction, ScanLevel, SpaceObject, SpaceState } from '../space';

/**
 * Owns the per-faction intel a faction holds on space objects: scan levels, the moment a
 * SNAPSHOT was captured, and the GM commands that write them. Every write to `scanLevels`
 * goes through here, so the faction bounds guard cannot be routed around.
 */
export class FactionIntelManager {
    constructor(private state: SpaceState) {}

    /**
     * @param totalSeconds seconds since the game started, stamped on captured snapshots
     * @param visibleByFaction the objects each faction sees this tick, indexed by faction.
     * Supplied by the caller (not read back from a cache) so that demotion cannot run against
     * a stale field of view.
     */
    public update(totalSeconds: number, visibleByFaction: ReadonlyArray<ReadonlySet<SpaceObject>>) {
        this.processSetScanLevelCommands();
        this.updateScanDemotion(totalSeconds, visibleByFaction);
    }

    private processSetScanLevelCommands() {
        for (const cmd of this.state.setScanLevelCommands) {
            this.setScanLevel(cmd.targetId, cmd.faction, cmd.level);
        }
        this.state.setScanLevelCommands = [];
    }

    /**
     * Per-faction passive demotion: a ship at FULL that is out of a faction's line of sight
     * demotes to SNAPSHOT, capturing the moment of demotion. Promotion is driven by each
     * ship's signals scan-job queue (SignalsJobManager). Only ships reach FULL, so nothing
     * else can demote.
     */
    private updateScanDemotion(totalSeconds: number, visibleByFaction: ReadonlyArray<ReadonlySet<SpaceObject>>) {
        for (const ship of this.state.getAll('Spaceship')) {
            for (let faction: Faction = 0; faction < Faction.FACTION_COUNT; faction++) {
                if (
                    !visibleByFaction[Number(faction)]?.has(ship) &&
                    this.getScanLevel(ship.id, faction) === ScanLevel.FULL
                ) {
                    this.setScanLevel(ship.id, faction, ScanLevel.SNAPSHOT);
                    this.setScanSnapshotCapturedAt(ship.id, faction, totalSeconds);
                }
            }
        }
    }

    /**
     * Resolves a target + faction pair to the live object and its per-faction array index.
     * Null when the target is gone or the faction has no slot (e.g. Faction.NONE = -1).
     */
    private getScanSlot(targetId: string, faction: Faction): readonly [SpaceObject, number] | null {
        const target = this.state.get(targetId);
        const factionIndex = Number(faction);
        return target && !target.destroyed && factionIndex >= 0 && factionIndex < Number(Faction.FACTION_COUNT)
            ? [target, factionIndex]
            : null;
    }

    /**
     * Set scan level for target (called by job completion and by GM commands)
     */
    public setScanLevel(targetId: string, faction: Faction, level: ScanLevel): void {
        const slot = this.getScanSlot(targetId, faction);
        if (slot) {
            const [target, factionIndex] = slot;
            target.scanLevels[factionIndex] = level;
        }
    }

    /**
     * Get scan level for target (used by radar widgets)
     * Returns ScanLevel.UFO (0) if not set, or at least BASIC for same-faction targets
     */
    public getScanLevel(targetId: string, faction: Faction): ScanLevel {
        const slot = this.getScanSlot(targetId, faction);
        if (!slot) {
            return ScanLevel.UFO;
        }
        const [target, factionIndex] = slot;
        const storedLevel = target.scanLevels[factionIndex] || ScanLevel.UFO;
        // Objects from same faction have at least BASIC scan level
        if (target.faction === faction) {
            return Math.max(storedLevel, ScanLevel.BASIC);
        }
        return storedLevel;
    }

    /**
     * Timestamp (IterationData.totalSeconds) at which the faction's SNAPSHOT view of the
     * target was captured. 0 if the target has never demoted from FULL for this faction.
     */
    public getScanSnapshotCapturedAt(targetId: string, faction: Faction): number {
        const slot = this.getScanSlot(targetId, faction);
        if (!slot) {
            return 0;
        }
        const [target, factionIndex] = slot;
        return target.scanSnapshotCapturedAt[factionIndex] ?? 0;
    }

    private setScanSnapshotCapturedAt(targetId: string, faction: Faction, atSeconds: number): void {
        const slot = this.getScanSlot(targetId, faction);
        if (slot) {
            const [target, factionIndex] = slot;
            target.scanSnapshotCapturedAt[factionIndex] = atSeconds;
        }
    }
}
