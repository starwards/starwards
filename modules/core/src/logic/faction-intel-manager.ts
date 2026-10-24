import { Faction, ScanLevel, SpaceObject, SpaceState, isMissile } from '../space';
import type { ShipSnapshot } from '../ship/ship-snapshot';
import { drainCommands } from '../commands';

/** How long a FULL scan survives without any friendly scan beam on the target (M4.19 ruling). */
export const FULL_SCAN_GRACE_SECONDS = 0.5;

/**
 * Owns the per-faction intel a faction holds on space objects: scan levels, the moment a
 * SNAPSHOT was captured, the captured snapshots themselves, and the GM commands that write them. Every write to `scanLevels`
 * goes through here, so the faction bounds guard cannot be routed around.
 */
export class FactionIntelManager {
    /** seconds each (target, faction) FULL has gone without scan-beam cover, keyed `${targetId}/${faction}` */
    private uncoveredSeconds = new Map<string, number>();
    /** faction of the ship that fired each in-flight missile, keyed by missile id */
    private firingFactions = new Map<string, Faction>();
    /** captured SNAPSHOTs, keyed by target id then faction. Plain memory: never synced (SPEC-0008 §5). */
    private snapshots = new Map<string, Map<Faction, ShipSnapshot>>();
    private totalSeconds = 0;

    /**
     * Encodes a ship's current `ShipState` (`encodeShipSnapshot`), called on FULL→SNAPSHOT demotion
     * to capture the snapshot. Set by the owner of the ship managers; without it nothing is captured.
     */
    public encodeShip: (shipId: string) => Uint8Array | undefined = () => undefined;

    constructor(private state: SpaceState) {}

    /**
     * @param totalSeconds seconds since the game started, stamped on captured snapshots
     * @param deltaSeconds seconds since the last update, counted against the FULL grace
     * @param beamCoveredByFaction the objects each faction holds under a scan beam this tick,
     * indexed by faction. Supplied by the caller (not read back from a cache) so that demotion
     * cannot run against a stale field of view.
     */
    public update(
        totalSeconds: number,
        deltaSeconds: number,
        beamCoveredByFaction: ReadonlyArray<ReadonlySet<SpaceObject>>,
    ) {
        this.totalSeconds = totalSeconds;
        this.processSetScanLevelCommands();
        this.updateScanDemotion(totalSeconds, deltaSeconds, beamCoveredByFaction);
        this.clearDestroyedSnapshots();
    }

    private clearDestroyedSnapshots() {
        for (const targetId of this.snapshots.keys()) {
            const target = this.state.get(targetId);
            if (!target || target.destroyed) {
                this.snapshots.delete(targetId);
            }
        }
    }

    private captureSnapshot(targetId: string, faction: Faction, atSeconds: number) {
        const data = this.encodeShip(targetId);
        if (!data) return;
        let byFaction = this.snapshots.get(targetId);
        if (!byFaction) {
            byFaction = new Map();
            this.snapshots.set(targetId, byFaction);
        }
        byFaction.set(faction, { capturedAt: atSeconds, data });
    }

    /**
     * The faction's last captured SNAPSHOT of the target, shared by every ship of that faction.
     * Undefined if the faction never demoted the target from FULL, or the target is gone.
     */
    public getSnapshot(targetId: string, faction: Faction): ShipSnapshot | undefined {
        return this.getScanSlot(targetId, faction) ? this.snapshots.get(targetId)?.get(faction) : undefined;
    }

    /** Game seconds since the faction's snapshot of the target was captured; undefined without one. */
    public getSnapshotAge(targetId: string, faction: Faction): number | undefined {
        const snapshot = this.getSnapshot(targetId, faction);
        return snapshot && this.totalSeconds - snapshot.capturedAt;
    }

    private processSetScanLevelCommands() {
        drainCommands('setScanLevel', this.state.setScanLevelCommands, (cmd) =>
            this.setScanLevel(cmd.targetId, cmd.faction, cmd.level),
        );
        this.state.setScanLevelCommands = [];
    }

    /**
     * Per-faction FULL maintenance: a faction holds FULL on a ship or missile only while one of its
     * scan beams covers it. After `FULL_SCAN_GRACE_SECONDS` without cover the target demotes to
     * SNAPSHOT, capturing the moment of demotion. Promotion is driven by each ship's signals scan-job
     * queue (SignalsJobManager). A faction always holds FULL on its own objects and missiles; shells
     * keep their level for their short life.
     */
    private updateScanDemotion(
        totalSeconds: number,
        deltaSeconds: number,
        beamCoveredByFaction: ReadonlyArray<ReadonlySet<SpaceObject>>,
    ) {
        const uncovered = new Map<string, number>();
        const firingFactions = new Map<string, Faction>();
        const demote = (target: SpaceObject, firingFaction: Faction | undefined) => {
            for (let faction: Faction = 0; faction < Faction.FACTION_COUNT; faction++) {
                if (
                    target.faction === faction ||
                    firingFaction === faction ||
                    beamCoveredByFaction[Number(faction)]?.has(target) ||
                    this.getScanLevel(target.id, faction) !== ScanLevel.FULL
                ) {
                    continue;
                }
                const key = `${target.id}/${faction}`;
                const seconds = (this.uncoveredSeconds.get(key) ?? 0) + deltaSeconds;
                if (seconds > FULL_SCAN_GRACE_SECONDS) {
                    this.setScanLevel(target.id, faction, ScanLevel.SNAPSHOT);
                    this.setScanSnapshotCapturedAt(target.id, faction, totalSeconds);
                    this.captureSnapshot(target.id, faction, totalSeconds);
                } else {
                    uncovered.set(key, seconds);
                }
            }
        };
        for (const ship of this.state.getAll('Spaceship')) {
            demote(ship, undefined);
        }
        for (const projectile of this.state.getAll('Projectile')) {
            if (!isMissile(projectile)) {
                continue;
            }
            // The firing ship's faction always knows its missile. Remembered per missile, so that
            // knowledge outlives a firing ship destroyed while the missile is in flight.
            const firingFaction = this.firingFactions.get(projectile.id) ?? this.state.get(projectile.shipId)?.faction;
            if (firingFaction !== undefined) {
                firingFactions.set(projectile.id, firingFaction);
            }
            demote(projectile, firingFaction);
        }
        this.firingFactions = firingFactions;
        this.uncoveredSeconds = uncovered;
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
        const target = this.state.get(targetId);
        return target ? this.getScanLevelOf(target, faction) : ScanLevel.UFO;
    }

    /** {@link getScanLevel} of an object already in hand, without looking it up by id. */
    public getScanLevelOf(target: SpaceObject, faction: Faction): ScanLevel {
        const factionIndex = Number(faction);
        if (target.destroyed || factionIndex < 0 || factionIndex >= Number(Faction.FACTION_COUNT)) {
            return ScanLevel.UFO;
        }
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
