import { Driver, LiveShipIntel, ShipDriver, SpaceDriver, StationsManifest } from '@starwards/core/internal';
import {
    RadarView,
    StationSession,
    fetchStationsManifest,
    openStation,
    withMultiplexedStations,
} from '@starwards/bots';

/** How often a held button checks how much game time has passed. */
const HOLD_POLL_MS = 50;

/**
 * Holds last game seconds, not wall seconds, so a burst lasts as long as it did in training at any
 * game speed, and a paused game holds the trigger until play resumes — or until `signal` aborts,
 * which lets go at once whatever the game clock does.
 */
function gameTimeWait(admin: { state: { speed: number } }) {
    return (seconds: number, signal: AbortSignal) =>
        new Promise<void>((resolve) => {
            let held = 0;
            let last = Date.now();
            const done = () => {
                clearInterval(timer);
                signal.removeEventListener('abort', done);
                resolve();
            };
            const timer = setInterval(() => {
                const now = Date.now();
                held += ((now - last) / 1000) * admin.state.speed;
                last = now;
                if (held >= seconds) done();
            }, HOLD_POLL_MS);
            if (signal.aborted) done();
            else signal.addEventListener('abort', done);
        });
}

type LiveShipContext = {
    manifest: StationsManifest;
    shipDriver: ShipDriver;
    spaceDriver: SpaceDriver;
    radar: RadarView;
    shipIntel: LiveShipIntel;
    wait: (seconds: number, signal: AbortSignal) => Promise<void>;
};

/** Everything a ship's seats share: one manifest fetch, one radar view, one game-time clock. */
export async function liveShipContext(driver: Driver, baseUrl: URL, shipId: string): Promise<LiveShipContext> {
    const manifest = withMultiplexedStations(await fetchStationsManifest(baseUrl, shipId));
    await driver.waitForShip(shipId);
    const spaceDriver = await driver.getSpaceDriver();
    const shipDriver = await driver.getShipDriver(shipId);
    return {
        manifest,
        shipDriver,
        spaceDriver,
        radar: RadarView.fromDriver(spaceDriver),
        shipIntel: new LiveShipIntel((id) => driver.getShipDriver(id), shipDriver),
        wait: gameTimeWait(await driver.getAdminDriver()),
    };
}

/**
 * Opens a station through the same session layer the MCP uses, so a bot sees what a player at it
 * sees. Bots are never station-registry entries, so nothing is registered.
 */
export function liveStation(ctx: LiveShipContext, station: string): StationSession {
    if (!ctx.manifest.stations[station]?.enabled) {
        throw new Error(`station "${station}" is not open on ${ctx.shipDriver.id}`);
    }
    const options = { radar: ctx.radar, wait: ctx.wait, shipIntel: ctx.shipIntel };
    return openStation(
        ctx.manifest,
        station,
        (s, entry) => new StationSession(s, entry, ctx.shipDriver, ctx.spaceDriver, options),
    );
}
