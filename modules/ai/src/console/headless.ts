import {
    RadarView,
    SessionShipDriver,
    SessionSpaceDriver,
    StationSession,
    openStation,
    withMultiplexedStations,
} from '@starwards/bots';
import {
    ShipState,
    SpaceState,
    StateCommand,
    getSystems,
    handleJsonPointerCommand,
    repairCommands,
} from '@starwards/core/internal';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { getStationsManifest } from '@starwards/server/src/stations-manifest';

/**
 * Simulated time for the station sandbox. A headless game runs far faster than the wall clock, so
 * a held trigger ("fire for one second") must end after one simulated second, which only the host
 * driving the ticks can tell.
 */
export class SimClock {
    private waiting: { at: number; resolve: () => void }[] = [];

    constructor(private now: number) {}

    wait = (seconds: number) => new Promise<void>((resolve) => this.waiting.push({ at: this.now + seconds, resolve }));

    /**
     * Call before every tick: releases every wait that is due and lets the released holds finish, so
     * a trigger whose burst ended is let go before a new burst pulls it again on the same tick.
     */
    async advance(now: number) {
        this.now = now;
        const due = this.waiting.filter((w) => w.at <= now + 1e-9);
        this.waiting = this.waiting.filter((w) => w.at > now + 1e-9);
        due.forEach((w) => w.resolve());
        if (due.length) {
            await new Promise<void>((resolve) => setImmediate(resolve));
        }
    }
}

const shipCommands: ReadonlyArray<StateCommand<unknown, ShipState, void>> = Object.values(repairCommands);

/**
 * Seats only a headless crew has, by the screen each one reads. The captain reads the whole fleet
 * picture on the dradis and gives orders by radio; none of the dradis's waypoint commands is a button
 * a brain presses, so the seat has no controls.
 */
const headlessOnlySeats: Readonly<Record<string, string>> = { captain: 'dradis' };

/**
 * Seats a station in a headless game through the real MCP station sandbox, so a brain trained here
 * reads the same panels and presses the same buttons as one seated in a live game. Writes go
 * through the same JSON-pointer handler and typed commands the ship and space rooms apply.
 */
export function headlessStation(game: HeadlessGame, shipId: string, station: string, clock: SimClock) {
    const manager = game.shipManagers.get(shipId);
    if (!manager) {
        throw new Error(`no ship ${shipId} in ${game.mapName}`);
    }
    const shipState = manager.state;
    const spaceState: SpaceState = game.spaceManager.state;
    const shipDriver: SessionShipDriver = {
        id: shipId,
        state: shipState,
        systems: getSystems(shipState),
        sendJsonCmd: (pointer, value) => void handleJsonPointerCommand({ value }, pointer, shipState),
        command: (cmd, value) => {
            const real = shipCommands.find((c) => c.cmdName === cmd.cmdName);
            if (!real) {
                throw new Error(`ship command ${cmd.cmdName} is not applied in headless games`);
            }
            real.setValue(shipState, value);
        },
    };
    const spaceDriver: SessionSpaceDriver = {
        state: spaceState,
        sendJsonCmd: (pointer, value) => void handleJsonPointerCommand({ value }, pointer, spaceState),
        command: (cmd, value) => cmd.setValue(spaceState, value),
    };
    const radar = new RadarView(game.spaceManager.spatialIndex, spaceState);
    return openStation(
        withMultiplexedStations(getStationsManifest(shipId)),
        headlessOnlySeats[station] ?? station,
        (seat, entry) => new StationSession(seat, entry, shipDriver, spaceDriver, { radar, wait: clock.wait }),
    );
}
