import { beginStationRegistration, sleep, waitFor } from '../src';

import { makeClient } from './driver';
import { makeDriver } from '@starwards/server/src/test/driver';
import { two_vs_one } from '@starwards/server/src/maps';

describe('beginStationRegistration', () => {
    const gameDriver = makeDriver();
    const clientDriver = makeClient(gameDriver.url);
    const otherClientDriver = makeClient(gameDriver.url);

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

    it('fires onRejected when the requested id is already connected under a different session', async () => {
        beginStationRegistration(clientDriver.driver, 'DUP', 'pilot', '');
        await waitFor(() => expect(gameDriver.gameManager.state.stations.get('DUP')?.connected).toBe(true), 3_000);

        let rejected = false;
        beginStationRegistration(otherClientDriver.driver, 'DUP', 'weapons', '', () => {
            rejected = true;
        });
        await waitFor(() => expect(rejected).toBe(true), 3_000);
        // the original owner's registration is untouched by the rejected request
        expect(gameDriver.gameManager.state.stations.get('DUP')?.stationType).toBe('pilot');
    });

    it('dispose() stops re-registering this station on a future reconnect', async () => {
        const registration = beginStationRegistration(clientDriver.driver, 'MNO', 'signals', '');
        await waitFor(() => expect(gameDriver.gameManager.state.stations.get('MNO')?.connected).toBe(true), 3_000);

        registration.dispose();
        await gameDriver.sockets.stop();
        await waitFor(() => expect(gameDriver.gameManager.state.stations.get('MNO')?.connected).toBe(false), 3_000);

        await gameDriver.sockets.resume();
        // give a still-listening (disposed-but-leaked) handler a chance to misfire
        await sleep(300);
        expect(gameDriver.gameManager.state.stations.get('MNO')?.connected).toBe(false);
    });
});
