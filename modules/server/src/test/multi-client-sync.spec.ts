import { makeMultiClientDriver } from './multi-client-driver';
import supertest from 'supertest';

describe('multi-client @commandable sync', () => {
    const driver = makeMultiClientDriver();
    if (process.env.CI) {
        jest.setTimeout(100_000);
    }

    beforeEach(async () => {
        await supertest(driver.serverDriver.httpServer).post('/start-game').send({ mapName: 'two_vs_one' }).expect(200);
        driver.serverDriver.gameManager.state.speed = 0;
    });

    it('client A writes @commandable property, client B observes the change', async () => {
        const clientA = driver.createClient('clientA');
        const clientB = driver.createClient('clientB');

        const ships = Array.from(driver.serverDriver.spaceManager.state.getAll('Spaceship'));
        const shipId = ships[0].id;

        const shipA = await clientA.connectShip(shipId);
        const shipB = await clientB.connectShip(shipId);

        await clientA.waitForSync(shipA);
        await clientB.waitForSync(shipB);

        // Write a @commandable property (radars[0].power) from client A
        await clientA.sendCommand(shipA, `/radars/0/power`, { value: 0.5 });

        // Client B should observe the change
        await clientB.waitForSubsystemProperty(shipB, 'radars/0', 'power', 0.5, 0.1);

        const stateB = clientB.getState(shipB);
        expect(stateB.radars[0].power).toBeCloseTo(0.5, 1);
    });

    it('space room command from one client is visible to another', async () => {
        const clientA = driver.createClient('clientA');
        const clientB = driver.createClient('clientB');

        const space1 = await clientA.connectSpace();
        const space2 = await clientB.connectSpace();

        await clientA.waitForSync(space1);
        await clientB.waitForSync(space2);

        const ships = Array.from(driver.serverDriver.spaceManager.state.getAll('Spaceship'));
        const shipId = ships[0].id;

        // Client A sets angle via space room command
        await clientA.sendCommand(space1, `/Spaceship/${shipId}/angle`, { value: 123 });

        // Client B should observe the change
        await clientB.waitForShipProperty(space2, shipId, 'angle', 123, 1);

        const stateB = clientB.getState(space2);
        const shipB = stateB.getShip(shipId);
        expect(shipB!.angle).toBeCloseTo(123, 0);
    });
});
