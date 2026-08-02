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
        // the roster's forward chain gun is bolted (bearingLimit 0, #2051) and can never leave 0 — use
        // the scan-beam radar instead, a mount that actually traverses (bearingLimit 180).
        expect(shipDriver.state.radars.length).toBeGreaterThan(1);

        const bearingCommandEvent = new Promise((res) => shipDriver.events.once('/radars/1/bearingCommand', res));
        const serverRadar = gameDriver.getShip(shipId).state.radars[1];
        serverRadar.bearingCommand = 12;

        await bearingCommandEvent;
        await waitFor(() => {
            expect(shipDriver.state.radars[1].bearingCommand).toBeCloseTo(12, 1);
        }, 3_000);
    }, 20_000);
});
