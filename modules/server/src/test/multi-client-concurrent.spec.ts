import { PowerLevel, sleep } from '@starwards/core';

import { makeMultiClientDriver } from './multi-client-driver';
import supertest from 'supertest';

describe('multi-client state synchronization', () => {
    const driver = makeMultiClientDriver();
    if (process.env.CI) {
        jest.setTimeout(100_000);
    }

    beforeEach(async () => {
        await supertest(driver.serverDriver.httpServer).post('/start-game').send({ mapName: 'two_vs_one' }).expect(200);
        driver.serverDriver.gameManager.state.speed = 0;
    });

    it('last write wins when clients modify same property', async () => {
        const client1 = driver.createClient('client1');
        const client2 = driver.createClient('client2');

        const space1 = await client1.connectSpace();
        const space2 = await client2.connectSpace();

        await client1.waitForSync(space1);
        await client2.waitForSync(space2);

        const ships = Array.from(driver.serverDriver.spaceManager.state.getAll('Spaceship'));
        const ship = ships[0];

        // Both clients try to set angle to different values
        // In real scenario, last write wins
        await client1.sendCommand(space1, `/Spaceship/${ship.id}/angle`, { value: 45 });
        await sleep(50);
        await client2.sendCommand(space2, `/Spaceship/${ship.id}/angle`, { value: 90 });

        await client1.waitForShipProperty(space1, ship.id, 'angle', 90, 1);

        const state1 = client1.getState(space1);
        const state2 = client2.getState(space2);
        const clientShip1 = state1.getShip(ship.id);
        const clientShip2 = state2.getShip(ship.id);

        // Both clients should see the same final value (last write wins)
        expect(clientShip1!.angle).toBeCloseTo(clientShip2!.angle, 0);
        expect(clientShip1!.angle).toBeCloseTo(90, 0);
    });

    it('rapid sequential commands preserve final value', async () => {
        const client1 = driver.createClient('client1');
        const space1 = await client1.connectSpace();
        await client1.waitForSync(space1);

        const ships = Array.from(driver.serverDriver.spaceManager.state.getAll('Spaceship'));
        const ship = ships[0];

        // Send rapid sequential updates
        for (let i = 0; i < 5; i++) {
            await client1.sendCommand(space1, `/Spaceship/${ship.id}/angle`, { value: i * 10 });
            await sleep(10);
        }

        await client1.waitForShipProperty(space1, ship.id, 'angle', 40, 1);

        const state1 = client1.getState(space1);
        const clientShip = state1.getShip(ship.id);

        // Should have final value
        expect(clientShip!.angle).toBeCloseTo(40, 0);
    });

    it('multi-client commands to same ship sync correctly', async () => {
        const client1 = driver.createClient('client1');
        const client2 = driver.createClient('client2');

        const ships = Array.from(driver.serverDriver.spaceManager.state.getAll('Spaceship'));
        const shipId = ships[0].id;

        const ship1 = await client1.connectShip(shipId);
        const ship2 = await client2.connectShip(shipId);

        await client1.waitForSync(ship1);
        await client2.waitForSync(ship2);

        // Multiple clients updating same ship state
        await client1.sendCommand(ship1, `/reactor/power`, { value: PowerLevel.MID });
        await sleep(50);
        await client2.sendCommand(ship2, `/reactor/power`, { value: PowerLevel.MAX });

        await client1.waitForSubsystemProperty(ship1, 'reactor', 'power', PowerLevel.MAX);

        const state1 = client1.getState(ship1);
        const state2 = client2.getState(ship2);

        // Both should see final value
        expect(state1.reactor.power).toBeCloseTo(state2.reactor.power, 1);
        expect(state1.reactor.power).toBeCloseTo(PowerLevel.MAX, 1);
    });
});
