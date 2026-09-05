import { Driver } from './driver';
import { RegisterStationArg } from '../stations';

export type StationRegistration = {
    stationId: string;
    /** The server-validated ship assignment for this station, or `''` if unassigned. */
    getAssignedShipId: () => Promise<string>;
    /**
     * Stops this registration from re-sending on future reconnects and from reporting future
     * rejections. Call before starting a new registration for the same physical seat (a rename,
     * a collision retry, a re-login) — otherwise the old registration's listeners keep firing
     * alongside the new one's, re-sending the stale id on every later reconnect.
     */
    dispose: () => void;
};

/**
 * Registers `stationId` as a station of `stationType` on the admin room's station registry,
 * requesting `requestedShipId` (may be `''`) as its ship self-assignment. Re-sends registration
 * on every reconnect — a fresh Colyseus session needs a fresh `registerStation` message for the
 * server's per-connection disconnect bookkeeping (`AdminRoom.onLeave`) to track it. Returns a
 * way to read back the server-resolved assignment, which may differ from `requestedShipId`:
 * rejected (stays `''`), or filled in later by auto-assign.
 *
 * `onRejected`, if given, fires when the server rejects this exact `stationId` as already
 * connected under a different session (see `AdminRoom`'s collision check) — the caller decides
 * what to do (typically: `dispose()` this registration, generate a fresh id, and call this
 * function again).
 */
export function beginStationRegistration(
    driver: Driver,
    stationId: string,
    stationType: string,
    requestedShipId: string,
    onRejected?: () => void,
): StationRegistration {
    const arg: RegisterStationArg = { stationId, stationType, shipId: requestedShipId };
    const send = () => void driver.getAdminDriver().then((adminDriver) => adminDriver.registerStation(arg));
    driver.connectionStatus.on('connected', send);
    let unsubscribeRejected: (() => void) | undefined;
    if (onRejected) {
        void driver.getAdminDriver().then((adminDriver) => {
            unsubscribeRejected = adminDriver.onRegisterStationRejected((rejectedStationId) => {
                if (rejectedStationId === stationId) {
                    onRejected();
                }
            });
        });
    }
    send();
    return {
        stationId,
        getAssignedShipId: async () => (await driver.getAdminDriver()).state.stations.get(stationId)?.shipId ?? '',
        dispose: () => {
            driver.connectionStatus.off('connected', send);
            unsubscribeRejected?.();
        },
    };
}
