import { Driver, StationWidget } from '@starwards/core/internal';
import { NotPermittedError, StationSession } from './session';
import { observeStation, radarContacts, shipStatus, stationCapabilities } from './console';

import { fetchStationsManifest } from './manifest';
import { makeDriver } from '@starwards/server/src/test/driver';
import { maps } from '@starwards/server';
import { widgetReaders } from '../readers';

const { test_map_1 } = maps;

describe('station console', () => {
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

    async function seat(station: string): Promise<StationSession> {
        const manifest = await fetchStationsManifest(baseUrl, test_map_1.testShipId);
        return new StationSession(
            station,
            manifest.stations[station],
            await gameConnection.getShipDriver(test_map_1.testShipId),
            await gameConnection.getSpaceDriver(),
        );
    }

    it('reports the capabilities of the seat', async () => {
        const session = await seat('helms');
        const capabilities = stationCapabilities(session);
        expect(capabilities.station).toBe('helms');
        expect(capabilities.shipId).toBe(test_map_1.testShipId);
        expect(capabilities.gameMaster).toBe(false);
        expect(capabilities.widgets).toEqual(session.widgets);
        expect(capabilities.commands.map((c) => c.command)).toEqual(session.commands);
    });

    it('reads a held panel and refuses one the seat does not hold', async () => {
        const session = await seat('helms');
        expect(shipStatus(session, 'helms-stats')).toHaveProperty('speed');
        expect(() => shipStatus(session, 'repair-queue')).toThrow(NotPermittedError);
    });

    it('pages the radar picture, and refuses a seat without a radar', async () => {
        const helms = await seat('helms');
        const picture = radarContacts(helms, { offset: 0, limit: 1 });
        expect(picture.ownShip.id).toBe(test_map_1.testShipId);
        expect(picture.contacts.length).toBeLessThanOrEqual(1);
        const engineer = await seat('engineer');
        expect(engineer.radarWidgets).toEqual([]);
        expect(() => radarContacts(engineer, { offset: 0, limit: 1 })).toThrow(NotPermittedError);
    });

    it('observes every non-radar panel, the radar and the capabilities in one call', async () => {
        const session = await seat('helms');
        const observed = observeStation(session, { radarLimit: 5 });
        const readable = session.widgets.filter((w) => widgetReaders[w]);
        expect(Object.keys(observed.panels).sort()).toEqual([...readable].sort());
        expect(observed.radar?.ownShip.id).toBe(test_map_1.testShipId);
        expect(observed.capabilities).toEqual(stationCapabilities(session));
    });

    it('leaves out the radar of a seat without one', async () => {
        const observed = observeStation(await seat('engineer'), { radarLimit: 5 });
        expect(observed.radar).toBeUndefined();
    });

    it('reports a panel whose reader throws as unreadable instead of failing the observation', async () => {
        const session = await seat('helms');
        const widget = session.widgets.find((w) => widgetReaders[w]) as StationWidget;
        const original = widgetReaders[widget];
        widgetReaders[widget] = () => {
            throw new Error('panel offline');
        };
        try {
            expect(observeStation(session, { radarLimit: 1 }).panels[widget]).toEqual({ unreadable: 'panel offline' });
        } finally {
            widgetReaders[widget] = original;
        }
    });
});
