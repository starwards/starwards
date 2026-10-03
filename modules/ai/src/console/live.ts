import { Driver, beginStationRegistration } from '@starwards/core/internal';

import { StationSession } from '@starwards/mcp/src/sandbox/session';
import { fetchStationsManifest } from '@starwards/mcp/src/sandbox/manifest';

/**
 * Seats a station on a ship of a live game, as the MCP `login` tool does: the server's manifest
 * decides what the seat holds, and the seat is registered so the GM roster shows it taken. `close`
 * stops re-registering on reconnect; the server frees the seat when the driver disconnects.
 */
/** How often a held button checks how much game time has passed. */
const HOLD_POLL_MS = 50;

/**
 * Holds last game seconds, not wall seconds, so a burst lasts as long as it did in training at any
 * game speed, and a paused game holds the trigger until play resumes.
 */
function gameTimeWait(admin: { state: { speed: number } }) {
    return (seconds: number) =>
        new Promise<void>((resolve) => {
            let held = 0;
            let last = Date.now();
            const timer = setInterval(() => {
                const now = Date.now();
                held += ((now - last) / 1000) * admin.state.speed;
                last = now;
                if (held >= seconds) {
                    clearInterval(timer);
                    resolve();
                }
            }, HOLD_POLL_MS);
        });
}

export async function liveStation(driver: Driver, baseUrl: URL, shipId: string, station: string) {
    const manifest = await fetchStationsManifest(baseUrl, shipId);
    const entry = manifest.stations[station];
    if (!entry?.enabled) {
        throw new Error(`station "${station}" is not open on ${shipId}`);
    }
    await driver.waitForShip(shipId);
    const session = new StationSession(
        station,
        entry,
        await driver.getShipDriver(shipId),
        await driver.getSpaceDriver(),
        { wait: gameTimeWait(await driver.getAdminDriver()) },
    );
    const registration = beginStationRegistration(driver, `ai-${station}`, station, shipId);
    return { session, close: () => registration.dispose() };
}
