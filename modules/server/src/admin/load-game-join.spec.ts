import { Driver, waitFor } from '@starwards/core/internal';
import { makeDriver } from '../test/driver';
import { two_vs_one } from '../maps';

describe('a loaded game', () => {
    const gameDriver = makeDriver();

    it('lets a client join a ship room', async () => {
        const manager = gameDriver.gameManager;
        await manager.startGame(two_vs_one);
        for (let i = 0; i < 10; i++) manager.update(0.1);
        await manager.loadGame(manager.saveGame()!, two_vs_one);
        const driver = new Driver(new URL(gameDriver.url())).connect();
        try {
            const shipId = manager.state.playerShipIds[0];
            const joined = await Promise.race([
                driver.getShipDriver(shipId).then((s) => s.state.spaceship.id),
                new Promise((r) => setTimeout(() => r('timed out'), 10_000)),
            ]);
            expect({ joined }).toEqual({ joined: shipId });
            const space = await driver.getSpaceDriver();
            for (let i = 0; i < 10; i++) manager.update(0.1);
            await waitFor(() => expect(space.state.getShip(shipId)?.id).toBe(shipId), 5_000);
        } finally {
            driver.destroy();
        }
    });
});
