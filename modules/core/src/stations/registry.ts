import { MapSchema } from '@colyseus/schema';

import { StationRegistryEntry } from './entry';

/**
 * Upserts `stationId`'s entry: marks it connected and records its station type. Never touches
 * `shipId` — assignment is a separate, validated step (see `GameManager`).
 */
export function upsertStationRegistration(
    stations: MapSchema<StationRegistryEntry>,
    stationId: string,
    stationType: string,
): StationRegistryEntry {
    let entry = stations.get(stationId);
    if (!entry) {
        entry = new StationRegistryEntry();
        entry.id = stationId;
        stations.set(stationId, entry);
    }
    entry.connected = true;
    entry.stationType = stationType;
    return entry;
}

/**
 * Flips an entry to disconnected. Its assignment (`shipId`) is left untouched — it survives
 * for the next reconnect.
 */
export function markStationDisconnected(stations: MapSchema<StationRegistryEntry>, stationId: string): void {
    const entry = stations.get(stationId);
    if (entry) {
        entry.connected = false;
    }
}

/** True if some *other* entry already holds `(shipId, stationType)`. */
export function isSlotTaken(
    stations: MapSchema<StationRegistryEntry>,
    shipId: string,
    stationType: string,
    excludeStationId?: string,
): boolean {
    for (const entry of stations.values()) {
        if (entry.id !== excludeStationId && entry.shipId === shipId && entry.stationType === stationType) {
            return true;
        }
    }
    return false;
}
