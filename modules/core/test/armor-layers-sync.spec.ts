import { makeClient } from './driver';
import { makeDriver } from '@starwards/server/src/test/driver';
import { test_map_1 } from '@starwards/server/src/maps';
import { waitFor } from '../src';

describe('armor layers sync', () => {
    const gameDriver = makeDriver();
    const clientDriver = makeClient(gameDriver.url);

    it('a layer health change syncs to the client and updates numberOfHealthyPlates', async () => {
        await gameDriver.gameManager.startGame(test_map_1);
        gameDriver.pauseGameCommand();
        const shipId = test_map_1.testShipId;
        const shipDriver = await clientDriver.driver.getShipDriver(shipId);
        expect(shipDriver.state.armor.armorPlates[0].layers.length).toBeGreaterThan(0);
        const healthyPlatesEvent = new Promise((res) => shipDriver.events.once('/armor/numberOfHealthyPlates', res));
        const layerHealthEvent = new Promise((res) =>
            shipDriver.events.once('/armor/armorPlates/0/layers/0/health', res),
        );
        const serverArmor = gameDriver.getShip(shipId).state.armor;
        for (const layer of serverArmor.armorPlates[0].layers) {
            layer.health = 0;
        }
        await Promise.all([layerHealthEvent, healthyPlatesEvent]);
        await waitFor(() => {
            expect(shipDriver.state.armor.armorPlates[0].layers[0].health).toEqual(0);
        }, 3_000);
        expect(shipDriver.state.armor.numberOfHealthyPlates).toEqual(shipDriver.state.armor.numberOfPlates - 1);
    }, 20_000);

    it('a plate layer syncs its own design to the client', async () => {
        await gameDriver.gameManager.startGame(test_map_1);
        gameDriver.pauseGameCommand();
        const shipId = test_map_1.testShipId;
        const shipDriver = await clientDriver.driver.getShipDriver(shipId);
        await waitFor(() => {
            const layer = shipDriver.state.armor.armorPlates[0].layers[0];
            expect(layer.design.plateMaxHealth).toBeGreaterThan(0);
            expect(layer.design.modelName).not.toEqual('');
        }, 3_000);
    }, 20_000);
});
