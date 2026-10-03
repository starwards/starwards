import { Driver, beginStationRegistration } from '@starwards/core/internal';

import { openStation, seatsOf, withMultiplexedStations } from '@starwards/mcp/src/sandbox/multiplex';

import { RadarView } from '@starwards/mcp/src/radar/radar-view';
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
    const manifest = withMultiplexedStations(await fetchStationsManifest(baseUrl, shipId));
    if (!manifest.stations[station]?.enabled) {
        throw new Error(`station "${station}" is not open on ${shipId}`);
    }
    await driver.waitForShip(shipId);
    const shipDriver = await driver.getShipDriver(shipId);
    const spaceDriver = await driver.getSpaceDriver();
    const options = { radar: RadarView.fromDriver(spaceDriver), wait: gameTimeWait(await driver.getAdminDriver()) };
    const session = openStation(
        manifest,
        station,
        (seat, entry) => new StationSession(seat, entry, shipDriver, spaceDriver, options),
    );
    const registrations = seatsOf(station).map((seat) => beginStationRegistration(driver, `ai-${seat}`, seat, shipId));
    return { session, close: () => registrations.forEach((r) => r.dispose()) };
}
