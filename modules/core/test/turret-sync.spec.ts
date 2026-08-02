import { makeClient } from './driver';
import { makeDriver } from '@starwards/server/src/test/driver';
import { test_map_1 } from '@starwards/server/src/maps';
import { waitFor } from '../src';

describe('turret bearingCommand sync', () => {
    const gameDriver = makeDriver();
    const clientDriver = makeClient(gameDriver.url);

    it('a bearingCommand change on the server syncs to the client (accessor over bearingCommandRaw, A2)', async () => {
        await gameDriver.gameManager.startGame(test_map_1);
        gameDriver.pauseGameCommand();
        const shipId = test_map_1.testShipId;
        const shipDriver = await clientDriver.driver.getShipDriver(shipId);
        expect(shipDriver.state.chainGuns.length).toBeGreaterThan(0);

        const bearingCommandEvent = new Promise((res) => shipDriver.events.once('/chainGuns/0/bearingCommand', res));
        const serverChainGun = gameDriver.getShip(shipId).state.chainGuns[0];
        serverChainGun.bearingCommand = 12;

        await bearingCommandEvent;
        await waitFor(() => {
            expect(shipDriver.state.chainGuns[0].bearingCommand).toBeCloseTo(12, 1);
        }, 3_000);
    }, 20_000);
});
