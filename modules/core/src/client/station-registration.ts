import { Driver } from './driver';
import { RegisterStationArg } from '../stations';

export type StationRegistration = {
    stationId: string;
    /** The server-validated ship assignment for this station, or `''` if unassigned. */
    getAssignedShipId: () => Promise<string>;
};

/**
 * Registers `stationId` as a station of `stationType` on the admin room's station registry,
 * requesting `requestedShipId` (may be `''`) as its ship self-assignment. Re-sends registration
 * on every reconnect — a fresh Colyseus session needs a fresh `registerStation` message for the
 * server's per-connection disconnect bookkeeping (`AdminRoom.onLeave`) to track it. Returns a
 * way to read back the server-resolved assignment, which may differ from `requestedShipId`:
 * rejected (stays `''`), or filled in later by auto-assign.
 */
export function beginStationRegistration(
    driver: Driver,
    stationId: string,
    stationType: string,
    requestedShipId: string,
): StationRegistration {
    const arg: RegisterStationArg = { stationId, stationType, shipId: requestedShipId };
    const send = () => void driver.getAdminDriver().then((adminDriver) => adminDriver.registerStation(arg));
    driver.connectionStatus.on('connected', send);
    send();
    return {
        stationId,
        getAssignedShipId: async () => (await driver.getAdminDriver()).state.stations.get(stationId)?.shipId ?? '',
    };
}
