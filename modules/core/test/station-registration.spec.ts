import { beginStationRegistration, waitFor } from '../src';

import { makeClient } from './driver';
import { makeDriver } from '@starwards/server/src/test/driver';
import { two_vs_one } from '@starwards/server/src/maps';

describe('beginStationRegistration', () => {
    const gameDriver = makeDriver();
    const clientDriver = makeClient(gameDriver.url);

    beforeEach(async () => {
        await gameDriver.gameManager.startGame(two_vs_one);
    });

    it('registers the station and reports its (initially unassigned) status', async () => {
        const registration = beginStationRegistration(clientDriver.driver, 'ABC', 'pilot', '');
        await waitFor(() => expect(gameDriver.gameManager.state.stations.get('ABC')?.connected).toBe(true), 3_000);
        expect(await registration.getAssignedShipId()).toBe('');
    });

    it('resolves the server-validated assignment for a valid self-assignment request', async () => {
        const registration = beginStationRegistration(clientDriver.driver, 'DEF', 'weapons', 'GVTS');
        await waitFor(async () => expect(await registration.getAssignedShipId()).toBe('GVTS'), 3_000);
    });

    it('re-registers after a reconnect', async () => {
        beginStationRegistration(clientDriver.driver, 'GHI', 'engineer', 'GVTS2');
        await waitFor(() => expect(gameDriver.gameManager.state.stations.get('GHI')?.connected).toBe(true), 3_000);

        await gameDriver.sockets.stop();
        await waitFor(() => expect(gameDriver.gameManager.state.stations.get('GHI')?.connected).toBe(false), 3_000);

        await gameDriver.sockets.resume();
        await waitFor(() => expect(gameDriver.gameManager.state.stations.get('GHI')?.connected).toBe(true), 3_000);
        expect(gameDriver.gameManager.state.stations.get('GHI')?.shipId).toBe('GVTS2');
    });
});
