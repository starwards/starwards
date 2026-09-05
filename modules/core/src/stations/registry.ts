import { MapSchema } from '@colyseus/schema';

import { StationRegistryEntry } from './entry';

const STATION_ID_PATTERN = /^[A-Z0-9-]{1,16}$/;

/**
 * A station id must be 1-16 characters of `[A-Z0-9-]`, matched case-insensitively. Shared
 * between the browser (validating a lobby rename before it's even sent) and the server
 * (`AdminRoom` normalizes and re-validates every `registerStation` — a client is not trusted to
 * have enforced this itself).
 */
export function isValidStationId(id: string): boolean {
    return STATION_ID_PATTERN.test(id.toUpperCase());
}

/**
 * Upserts `stationId`'s entry: marks it connected and records its station type. Never touches
 * `shipId` — assignment is a separate, validated step (see `GameManager`). An empty
 * `stationType` never overwrites an existing one: the lobby registers a device's tab id with
 * no type (it isn't a bridge seat), and overwriting a real seat's type with '' would make its
 * slot look invalid and cost it its sticky ship assignment on the next reconcile.
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
    if (stationType) {
        entry.stationType = stationType;
    }
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
