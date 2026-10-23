import { Asteroid, Vec2 } from '@starwards/core/internal';
import { makeMultiClientDriver } from './multi-client-driver';
import { matchMaker } from '@colyseus/core';
import supertest from 'supertest';

/**
 * Colyseus encodes every patch into one per-room buffer. A client whose socket is backed up queues
 * the patch it was sent; if that patch were a view of the shared buffer, the next tick's encode
 * would overwrite the queued bytes and the client would decode garbage ("refId" not found).
 * Corking the server side of the socket reproduces that backpressure deterministically.
 */
describe('state patches under socket backpressure', () => {
    const driver = makeMultiClientDriver();
    jest.setTimeout(60_000);

    it('a client whose socket was backed up still decodes every patch', async () => {
        await supertest(driver.serverDriver.httpServer)
            .post('/start-game')
            .send({ mapName: 'training_t1' })
            .expect(200);
        const client = driver.createClient('slow');
        const space = await client.connectSpace();
        await client.waitForSync(space);

        const decodeErrors: string[] = [];
        const capture = (...args: unknown[]) => decodeErrors.push(args.map(String).join(' '));
        const spies = [jest.spyOn(console, 'error'), jest.spyOn(console, 'warn')].map((spy) =>
            spy.mockImplementation(capture),
        );
        try {
            const room = matchMaker.getLocalRoomById('space') as unknown as {
                clients: { ref: { _socket: { cork(): void; uncork(): void } } }[];
            };
            const socket = room.clients[0].ref._socket;
            socket.cork();
            // objects added while backed up: their ADD lands in a patch that a later tick overwrites
            for (let i = 0; i < 10; i++) {
                driver.serverDriver.spaceManager.insert(
                    new Asteroid().init(`backpressure-${i}`, new Vec2(i * 1000, 0)),
                );
                await new Promise((resolve) => setTimeout(resolve, 200));
            }
            socket.uncork();
            await new Promise((resolve) => setTimeout(resolve, 1000));
        } finally {
            spies.forEach((spy) => spy.mockRestore());
        }

        expect(decodeErrors).toEqual([]);
        const serverIds = Array.from(driver.serverDriver.spaceManager.state.getAll('Asteroid'), (s) => s.id).sort();
        const clientIds = Array.from(client.getState(space).getAll('Asteroid'), (s) => s.id).sort();
        expect(clientIds).toEqual(serverIds);
    });
});
