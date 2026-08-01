import { Faction, ScanLevel, SpaceObject, Spaceship } from '@starwards/core';

/**
 * The scan level a player holds on an object. A GM view (no faction) sees everything; same-faction
 * objects are always at least BASIC.
 */
export function playerScanLevel(o: SpaceObject, playerFaction: Faction | undefined): ScanLevel {
    if (playerFaction === undefined) {
        return ScanLevel.FULL;
    }
    const factionIndex = Number(playerFaction);
    const rawLevel =
        factionIndex >= 0 && factionIndex < o.scanLevels.length
            ? ((o.scanLevels[factionIndex] as ScanLevel | undefined) ?? ScanLevel.UFO)
            : ScanLevel.UFO;
    if (o.faction === playerFaction && playerFaction !== Faction.NONE) {
        return Math.max(rawLevel, ScanLevel.BASIC);
    }
    return rawLevel;
}

/**
 * The contacts the signals station's target cycle steps through: every unidentified contact,
 * whatever it turns out to be, plus the ships already identified.
 *
 * Membership keys on scan level, never on type below BASIC — a cycle that visited exactly the
 * ships would tell the player which unidentified blips are ships just by being pressed. Above
 * BASIC the player has already earned the type, so excluding identified non-ships leaks nothing:
 * a rock at BASIC has nothing left to reveal, while a ship at SNAPSHOT can be marked and rescanned
 * when it re-enters range.
 */
export function scanCycleTargets(
    objects: Iterable<SpaceObject>,
    playerFaction: Faction | undefined,
    selfId: string,
): SpaceObject[] {
    return [...objects].filter((o) => {
        if (o.id === selfId) {
            return false;
        }
        const scanLevel = playerScanLevel(o, playerFaction);
        return scanLevel === ScanLevel.UFO || Spaceship.isInstance(o);
    });
}

/**
 * Human-facing name for a space object, for station panels and callouts.
 *
 * `makeId()` is a global incrementing counter, so ids are already short speakable integers that
 * stay stable for an object's lifetime — `Asteroid 47` needs no bookkeeping, and an object
 * missing from the space state falls back to its bare id.
 *
 * The type is disclosed only from BASIC up, where the player has earned it. A name is a
 * player-facing surface, so naming an unscanned contact by type would classify it for free.
 * A ship's callsign wins when it has one, which is BASIC-gated for the same reason.
 *
 * Single override point: the planned relay-owned naming database replaces names here.
 */
export function objectDisplayName(
    object: SpaceObject | undefined,
    id: string,
    scanLevel: ScanLevel = ScanLevel.FULL,
): string {
    if (!object || scanLevel < ScanLevel.BASIC) {
        return id;
    }
    if (Spaceship.isInstance(object) && object.callsign) {
        return object.callsign;
    }
    return `${object.type} ${object.id}`;
}
