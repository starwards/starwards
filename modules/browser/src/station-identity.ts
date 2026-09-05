/**
 * A station's persistent identity: a short id, generated once per browser/device and kept in
 * `localStorage` so the same physical seat re-registers as the same station across reloads.
 */

const STORAGE_KEY = 'starwards.stationId';

/** Alphanumeric, excluding characters easily confused with each other at a glance: 0/O, 1/I/L. */
const ID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export interface StationIdStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export function generateStationId(length = 3): string {
    let id = '';
    for (let i = 0; i < length; i++) {
        id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    }
    return id;
}

/** A rename must be 1-16 chars of `[A-Z0-9-]`, matched case-insensitively. */
export function isValidStationId(id: string): boolean {
    return /^[A-Z0-9-]{1,16}$/.test(id.toUpperCase());
}

export function getOrCreateStationId(storage: StationIdStorage = window.localStorage): string {
    const existing = storage.getItem(STORAGE_KEY);
    if (existing) {
        return existing;
    }
    const id = generateStationId();
    storage.setItem(STORAGE_KEY, id);
    return id;
}

export function setStationId(id: string, storage: StationIdStorage = window.localStorage): void {
    storage.setItem(STORAGE_KEY, id.toUpperCase());
}
