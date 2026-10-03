import { Driver, StationsManifest } from '@starwards/core/internal';
import { MultiplexedSession, openStation, withMultiplexedStations } from './multiplex';
import { NotPermittedError, SessionShipDriver, SessionSpaceDriver, StationSession } from './session';
import { observeStation, stationCapabilities } from './console';

import { RadarView } from '../radar/radar-view';
import { fetchStationsManifest } from './manifest';
import { makeDriver } from '@starwards/server/src/test/driver';
import { maps } from '@starwards/server';

const { test_map_1 } = maps;

describe('a multiplexed station', () => {
    const manifest: StationsManifest = {
        stations: {
            helms: { enabled: true, widgets: ['helms-radar', 'systems-status'], commands: ['rotation'] },
            weapons: { enabled: true, widgets: ['tactical-radar', 'systems-status'], commands: ['nextTarget'] },
        },
    };
    const fakeSeat = (station: string, entry: StationsManifest['stations'][string]) =>
        new StationSession(
            station,
            entry,
            { id: 'ship', state: {}, systems: [], sendJsonCmd: () => undefined } as unknown as SessionShipDriver,
            {} as SessionSpaceDriver,
            { radar: {} as RadarView },
        );

    it('is listed with the union of its members widgets and commands', () => {
        expect(withMultiplexedStations(manifest).stations.tactical).toEqual({
            enabled: true,
            widgets: ['helms-radar', 'systems-status', 'tactical-radar'],
            commands: ['rotation', 'nextTarget'],
            prompt: expect.any(String) as string,
        });
    });

    it('is closed when any member is closed', () => {
        const closed = {
            stations: { ...manifest.stations, weapons: { ...manifest.stations.weapons, enabled: false } },
        };
        expect(withMultiplexedStations(closed).stations.tactical.enabled).toBe(false);
        expect(() => openStation(closed, 'tactical', fakeSeat)).toThrow(NotPermittedError);
    });

    it('routes each command to the member seat that holds it and refuses what neither holds', async () => {
        const tactical = openStation(withMultiplexedStations(manifest), 'tactical', fakeSeat) as MultiplexedSession;
        const [helms, weapons] = tactical.members;
        const helmsExecute = jest.spyOn(helms, 'execute').mockResolvedValue('helms did it');
        const weaponsExecute = jest.spyOn(weapons, 'execute').mockResolvedValue('weapons did it');

        expect(await tactical.execute('rotation', {}, 0.1)).toBe('helms did it');
        expect(await tactical.execute('nextTarget', {}, true)).toBe('weapons did it');
        await expect(tactical.execute('systemPower', { system: '/reactor' }, 1)).rejects.toThrow(NotPermittedError);
        expect(helmsExecute).toHaveBeenCalledWith('rotation', {}, 0.1);
        expect(weaponsExecute).toHaveBeenCalledWith('nextTarget', {}, true);
        expect(tactical.seatOf('rotation')).toBe('helms');
        expect(tactical.seatOf('nextTarget')).toBe('weapons');
    });
});

describe('a multiplexed station in a running game', () => {
    const gameDriver = makeDriver();
    let gameConnection: Driver;
    let baseUrl: URL;

    beforeEach(async () => {
        await gameDriver.gameManager.startGame(test_map_1);
        baseUrl = new URL(gameDriver.url());
        gameConnection = new Driver(baseUrl).connect();
        await gameConnection.waitForShip(test_map_1.testShipId);
    });

    afterEach(() => {
        gameConnection.destroy();
    });

    async function seat(station: string) {
        const manifest = withMultiplexedStations(await fetchStationsManifest(baseUrl, test_map_1.testShipId));
        const shipDriver = await gameConnection.getShipDriver(test_map_1.testShipId);
        const spaceDriver = await gameConnection.getSpaceDriver();
        return openStation(
            manifest,
            station,
            (name, entry) => new StationSession(name, entry, shipDriver, spaceDriver),
        );
    }

    it('sees exactly the union of what helms and weapons each see, and tags each command with its seat', async () => {
        const [tactical, helms, weapons] = await Promise.all(['tactical', 'helms', 'weapons'].map(seat));
        const look = (s: StationSession) => observeStation(s, { radarLimit: 200 });
        const [t, h, w] = [look(tactical), look(helms), look(weapons)];
        const ids = (o: ReturnType<typeof look>) => new Set(o.radar?.contacts.map((c) => c.id));

        expect(Object.keys(t.panels).sort()).toEqual(
            [...new Set([...Object.keys(h.panels), ...Object.keys(w.panels)])].sort(),
        );
        expect(ids(t)).toEqual(new Set([...ids(h), ...ids(w)]));
        expect(t.radar?.contacts.length).toBeGreaterThan(0);
        const seats = new Map(stationCapabilities(tactical).commands.map((c) => [c.command, c.seat]));
        expect([seats.get('rotation'), seats.get('boost')]).toEqual(['helms', 'helms']);
        expect([seats.get('nextTarget'), seats.get('fireChainGun')]).toEqual(['weapons', 'weapons']);
    });
});
