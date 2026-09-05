import { Driver, StationRegistration, beginStationRegistration, isValidStationId } from '@starwards/core';

export { isValidStationId };

/**
 * A station's persistent identity, per tab with a machine-sticky default: the id lives in
 * `sessionStorage` (scoped to this one browser tab, so several tabs on one device never share
 * an id just because they share `localStorage`), seeded on first use in a tab from
 * `localStorage` (this machine's last-used id, recovered across a fresh browser session — e.g.
 * a tablet reboot clears `sessionStorage` but not `localStorage`) or, failing that, a freshly
 * generated id. A `?station=ID` url param overrides both, so a station can be pinned by URL.
 * Whichever id is resolved is written back to both storages.
 *
 * This is a client-side convenience, not a uniqueness guarantee: two tabs can still start with
 * the same seeded id (e.g. two fresh tabs opened at once on a machine with an existing
 * `localStorage` default). The server is the authority — see `AdminRoom`'s collision rejection,
 * which a rejected caller answers by generating a genuinely fresh id (`generateStationId`) and
 * retrying, never by falling back to this seeding chain again.
 */

const STORAGE_KEY = 'starwards.stationId';
const STATION_URL_PARAM = 'station';

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

export function getOrCreateStationId(
    sessionStore: StationIdStorage = window.sessionStorage,
    localStore: StationIdStorage = window.localStorage,
    urlParams: URLSearchParams = new URLSearchParams(window.location.search),
): string {
    const urlOverride = urlParams.get(STATION_URL_PARAM);
    const id =
        (urlOverride && urlOverride.toUpperCase()) ||
        sessionStore.getItem(STORAGE_KEY) ||
        localStore.getItem(STORAGE_KEY) ||
        generateStationId();
    sessionStore.setItem(STORAGE_KEY, id);
    localStore.setItem(STORAGE_KEY, id);
    return id;
}

export function setStationId(
    id: string,
    sessionStore: StationIdStorage = window.sessionStorage,
    localStore: StationIdStorage = window.localStorage,
): void {
    const normalized = id.toUpperCase();
    sessionStore.setItem(STORAGE_KEY, normalized);
    localStore.setItem(STORAGE_KEY, normalized);
}

/**
 * `beginStationRegistration` wrapped with this tab's id resolution, and with the server's
 * collision rejection handled: on reject, generates a genuinely fresh id (never falling back
 * to the seeding chain, which would likely just collide again), persists it as this tab's new
 * identity, and re-registers. `onIdChanged` — optional — is called whenever that happens, so a
 * caller displaying the id (the lobby badge) can stay in sync.
 */
export function beginStationRegistrationWithRetry(
    driver: Driver,
    stationType: string,
    requestedShipId: string,
    onIdChanged?: (newStationId: string) => void,
): StationRegistration {
    let stationId = getOrCreateStationId();
    let registration!: StationRegistration;
    const attempt = () => {
        registration = beginStationRegistration(driver, stationId, stationType, requestedShipId, () => {
            registration.dispose();
            stationId = generateStationId();
            setStationId(stationId);
            onIdChanged?.(stationId);
            attempt();
        });
    };
    attempt();
    return {
        get stationId() {
            return registration.stationId;
        },
        getAssignedShipId: () => registration.getAssignedShipId(),
        dispose: () => registration.dispose(),
    };
}
