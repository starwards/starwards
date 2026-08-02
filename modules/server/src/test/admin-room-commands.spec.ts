import { makeMultiClientDriver } from './multi-client-driver';
import { sleep } from '@starwards/core/internal';
import supertest from 'supertest';

// Behavior tests for AdminRoom (modules/server/src/admin/room.ts):
// the GM tweak panel's global speed lever (issue #2033) writes to AdminState.speed
// via a JSON Pointer command, same accept/range-capping path as ShipRoom/SpaceRoom.

describe('AdminRoom JSON pointer commands', () => {
    const driver = makeMultiClientDriver();
    if (process.env.CI) {
        jest.setTimeout(100_000);
    }

    beforeEach(async () => {
        await supertest(driver.serverDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
    });

    async function connectAdmin(name: string) {
        const client = driver.createClient(name);
        const room = await client.connectAdmin();
        await client.waitForSync(room);
        return { client, room };
    }

    async function waitForServer(predicate: () => boolean, timeoutMs = 5000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            if (predicate()) return;
            await sleep(50);
        }
        throw new Error(`waitForServer timeout after ${timeoutMs}ms`);
    }

    it('applies a GM write to the global speed lever', async () => {
        const { client, room } = await connectAdmin('gm-speed');
        await client.sendCommand(room, '/speed', { value: 2 });
        await waitForServer(() => driver.serverDriver.gameManager.state.speed === 2);
        expect(driver.serverDriver.gameManager.state.speed).toEqual(2);
    });

    it('caps speed writes to the @range of the field', async () => {
        const { client, room } = await connectAdmin('gm-speed-capper');
        await client.sendCommand(room, '/speed', { value: 999 });
        await waitForServer(() => driver.serverDriver.gameManager.state.speed === 3);
        expect(driver.serverDriver.gameManager.state.speed).toEqual(3);
    });

    it('speed is sticky across a stop/start cycle — deliberately not auto-reset (see PR discussion for issue #2033)', async () => {
        const { client, room } = await connectAdmin('gm-speed-sticky');
        await client.sendCommand(room, '/speed', { value: 2.5 });
        await waitForServer(() => driver.serverDriver.gameManager.state.speed === 2.5);

        await supertest(driver.serverDriver.httpServer).post('/stop-game').send({}).expect(200);
        expect(driver.serverDriver.gameManager.state.speed).toEqual(2.5);

        await supertest(driver.serverDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
        expect(driver.serverDriver.gameManager.state.speed).toEqual(2.5);
    });
});
