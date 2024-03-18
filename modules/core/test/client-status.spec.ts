import { ClientStatus, Status, StatusInfo, waitFor } from '../src';

import { makeClient } from './driver';
import { makeDriver } from '@starwards/server/src/test/driver';
import { test_map_1 } from '@starwards/server/src/maps';

const waitForStatus = (actual: () => Promise<StatusInfo>, expected: Partial<StatusInfo>) =>
    waitFor(async () => expect(await actual()).toEqual(expected), 3_000);

const connectedNoActiveGame = Object.freeze({ status: Status.CONNECTED, text: 'no active game' });
const shipFound = Object.freeze({ status: Status.SHIP_FOUND, text: '' });
const disconnected = Object.freeze({ status: Status.DISCONNECTED, text: 'err: disconnected from server' });

describe('client status', () => {
    describe('with no server', () => {
        const clientDriver = makeClient(() => `http://localhost:1/`);
        it('getStatus() returns no connection', async () => {
            const status = new ClientStatus(clientDriver.driver);
            await waitForStatus(
                status.getStatus,
                expect.objectContaining({
                    status: Status.DISCONNECTED,
                    text: expect.stringContaining('offline') as unknown,
                }) as StatusInfo,
            );
        });
    });
    describe('with server', () => {
        const gameDriver = makeDriver();
        const clientDriver = makeClient(gameDriver.url);
        it('getStatus() returns connected', async () => {
            const status = new ClientStatus(clientDriver.driver);
            await waitForStatus(status.getStatus, connectedNoActiveGame);
        });
        describe('and a active game', () => {
            beforeEach(async () => {
                await gameDriver.gameManager.startGame(test_map_1);
            });
            it('getStatus() returns game running', async () => {
                const status = new ClientStatus(clientDriver.driver);
                await waitForStatus(status.getStatus, {
                    status: Status.GAME_RUNNING,
                    text: '',
                });
            });
            it('getStatus() returns ship not found', async () => {
                const status = new ClientStatus(clientDriver.driver, 'wrong_ship_id');
                await waitForStatus(status.getStatus, {
                    status: Status.GAME_RUNNING,
                    text: 'ship not found',
                });
            });
            it('getStatus() returns ship found', async () => {
                const status = new ClientStatus(clientDriver.driver, test_map_1.testShipId);
                await waitForStatus(status.getStatus, shipFound);
            });
        });
        it('onStatusChange() emits current status', async () => {
            await waitFor(() => expect(clientDriver.driver.isConnected).toBeTruthy(), 3_000);
            const statuses: StatusInfo[] = [];
            new ClientStatus(clientDriver.driver).onStatusChange((s) => statuses.push(s));
            await waitFor(() => expect(statuses).toEqual([connectedNoActiveGame]), 3_000);
        });
        it('onStatusChange() tracks changes', async () => {
            const statuses: StatusInfo[] = [];
            new ClientStatus(clientDriver.driver, test_map_1.testShipId).onStatusChange((s) => statuses.push(s));
            await waitFor(() => expect(statuses.pop()).toEqual(connectedNoActiveGame), 3_000);
            await gameDriver.gameManager.startGame(test_map_1);
            await waitFor(() => expect(statuses.pop()).toEqual(shipFound), 3_000);
        });
        it('onStatusChange() detects disconnection and reconnection', async () => {
            const statuses: StatusInfo[] = [];
            new ClientStatus(clientDriver.driver, test_map_1.testShipId).onStatusChange((s) => statuses.push(s));
            await gameDriver.gameManager.startGame(test_map_1);
            await waitFor(() => expect(statuses.pop()).toEqual(shipFound), 3_000);
            await gameDriver.sockets.stop();
            await waitFor(() => expect(statuses.pop()).toEqual(disconnected), 3_000);
            await gameDriver.sockets.resume();
            await waitFor(() => expect(statuses.pop()).toEqual(shipFound), 3_000);
        });
    });
});
