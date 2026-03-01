import { makeClient } from './driver';
import { makeDriver } from '@starwards/server/src/test/driver';
import { test_map_1 } from '@starwards/server/src/maps';
import { waitFor } from '../src';

describe('driver cache invalidation', () => {
    const gameDriver = makeDriver();
    const clientDriver = makeClient(gameDriver.url);

    it('should invalidate ship driver cache when ship is converted to NPC and back multiple times', async () => {
        await gameDriver.gameManager.startGame(test_map_1);
        const shipId = test_map_1.testShipId;

        // Get initial driver
        const shipDriver1 = await clientDriver.driver.getShipDriver(shipId);
        expect(shipDriver1).toBeDefined();

        // Convert to NPC — wait for admin state to reflect the change
        await gameDriver.gameManager.convertShipType(shipId, false);
        await waitFor(
            async () => {
                const playerIds = await clientDriver.driver.getCurrentPlayerShipIds();
                if ([...playerIds].includes(shipId)) {
                    throw new Error('Ship still in playerShipIds');
                }
            },
            2000,
            50,
        );

        // Convert back to Player
        await gameDriver.gameManager.convertShipType(shipId, true);
        const shipDriver2 = await clientDriver.driver.getShipDriver(shipId);
        expect(shipDriver1).not.toBe(shipDriver2);

        // Convert to NPC again — wait for admin state
        await gameDriver.gameManager.convertShipType(shipId, false);
        await waitFor(
            async () => {
                const playerIds = await clientDriver.driver.getCurrentPlayerShipIds();
                if ([...playerIds].includes(shipId)) {
                    throw new Error('Ship still in playerShipIds');
                }
            },
            2000,
            50,
        );

        // Convert back to Player again
        await gameDriver.gameManager.convertShipType(shipId, true);

        // This might hang if waitForShip uses a persistent Set
        const shipDriver3 = await Promise.race([
            clientDriver.driver.getShipDriver(shipId),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for ship driver')), 2000)),
        ]);

        expect(shipDriver3).toBeDefined();
        expect(shipDriver3).not.toBe(shipDriver2);
    });
});
