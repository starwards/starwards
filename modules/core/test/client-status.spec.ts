import { ClientStatus, Status, StatusInfo, waitFor } from '../src';

import { makeClient } from './driver';
import { makeDriver } from '@starwards/server/src/test/driver';
import { test_map_1 } from '@starwards/server/src/maps';

const waitForStatus = (actual: () => Promise<StatusInfo>, expected: Partial<StatusInfo>) =>
    waitFor(async () => expect(await actual()).toEqual(expected), 3_000);

describe('client status', () => {
    describe('with no server', () => {
        const clientDriver = makeClient(() => `http://localhost:1/`);
        it('no connection', async () => {
            const status = new ClientStatus(clientDriver.driver);
            await waitForStatus(
                status.getStatus,
                expect.objectContaining({
                    status: Status.DISCONNECTED,
                    text: expect.stringContaining('ECONNREFUSED') as unknown,
                }) as StatusInfo
            );
        });
    });
    describe('with server', () => {
        const gameDriver = makeDriver();
        const clientDriver = makeClient(gameDriver.url);
        it('connected', async () => {
            const status = new ClientStatus(clientDriver.driver);
            await waitForStatus(status.getStatus, {
                status: Status.CONNECTED,
                text: 'no active game',
            });
        });
        describe('and a active game', () => {
            beforeEach(async () => {
                await gameDriver.gameManager.startGame(test_map_1);
            });
            it('game running', async () => {
                const status = new ClientStatus(clientDriver.driver);
                await waitForStatus(status.getStatus, {
                    status: Status.GAME_RUNNING,
                    text: '',
                });
            });
            it('ship not found', async () => {
                const status = new ClientStatus(clientDriver.driver, 'wrong_ship_id');
                await waitForStatus(status.getStatus, {
                    status: Status.GAME_RUNNING,
                    text: 'ship not found',
                });
            });
            it('ship not found', async () => {
                const status = new ClientStatus(clientDriver.driver, test_map_1.testShipId);
                await waitForStatus(status.getStatus, {
                    status: Status.SHIP_FOUND,
                    text: '',
                });
            });
        });
    });
});
