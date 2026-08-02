import { TargetedStatus } from '@starwards/core';
import { makeMultiClientDriver } from './multi-client-driver';
import { sleep } from '@starwards/core/internal';
import supertest from 'supertest';

// Behavior tests for ShipRoom (modules/server/src/ship/room.ts):
// every ship-room message goes through handleJsonPointerCommand, so this
// covers the accept path, range capping, whitelist rejection and resilience
// to malformed messages.

describe('ShipRoom JSON pointer commands', () => {
    const driver = makeMultiClientDriver();
    if (process.env.CI) {
        jest.setTimeout(100_000);
    }

    beforeEach(async () => {
        await supertest(driver.serverDriver.httpServer).post('/start-game').send({ mapName: 'two_vs_one' }).expect(200);
        driver.serverDriver.gameManager.state.speed = 0; // pause game loop; message handling is not tick-driven
    });

    async function connectShip(name: string) {
        const client = driver.createClient(name);
        const shipId = driver.serverDriver.gameManager.state.playerShipIds[0];
        const room = await client.connectShip(shipId);
        await client.waitForSync(room);
        return { client, room, shipId };
    }

    async function waitForServer(predicate: () => boolean, timeoutMs = 5000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            if (predicate()) return;
            await sleep(50);
        }
        throw new Error(`waitForServer timeout after ${timeoutMs}ms`);
    }

    it('applies a @commandable write to the server ship state', async () => {
        const { client, room, shipId } = await connectShip('writer');
        const shipManager = driver.serverDriver.getShip(shipId);
        await client.sendCommand(room, '/radars/0/power', { value: 0.25 });
        await waitForServer(() => Math.abs(shipManager.state.radars[0].power - 0.25) < 0.01);
        expect(shipManager.state.radars[0].power).toBeCloseTo(0.25, 2);
    });

    it('caps numeric writes to the @range of the field', async () => {
        const { client, room, shipId } = await connectShip('capper');
        const shipManager = driver.serverDriver.getShip(shipId);
        await client.sendCommand(room, '/radars/0/power', { value: 999 });
        await waitForServer(() => Math.abs(shipManager.state.radars[0].power - 1) < 0.01);
        expect(shipManager.state.radars[0].power).toBeCloseTo(1, 2);
    });

    it('rejects writes to non-commandable fields', async () => {
        const { client, room, shipId } = await connectShip('intruder');
        const shipManager = driver.serverDriver.getShip(shipId);
        expect(shipManager.state.targeted).toEqual(TargetedStatus.NONE);
        await client.sendCommand(room, '/targeted', { value: TargetedStatus.FIRED_UPON });
        // follow with a valid write — messages are processed in order, so once
        // it lands we know the rejected write was already handled
        await client.sendCommand(room, '/radars/0/power', { value: 0.25 });
        await waitForServer(() => Math.abs(shipManager.state.radars[0].power - 0.25) < 0.01);
        expect(shipManager.state.targeted).toEqual(TargetedStatus.NONE);
    });

    it('survives malformed and unknown messages and keeps serving commands', async () => {
        const { client, room, shipId } = await connectShip('fuzzer');
        const shipManager = driver.serverDriver.getShip(shipId);
        await client.sendCommand(room, 'not a json pointer !', { value: 1 });
        await client.sendCommand(room, '/radars/0/power', {}); // missing value
        await client.sendCommand(room, '/radars/0/power', { value: 0.75 });
        await waitForServer(() => Math.abs(shipManager.state.radars[0].power - 0.75) < 0.01);
        expect(shipManager.state.radars[0].power).toBeCloseTo(0.75, 2);
    });

    it('applies a @commandable write to the scan beam radar direction', async () => {
        const { client, room, shipId } = await connectShip('beam-director');
        const shipManager = driver.serverDriver.getShip(shipId);
        // the game loop is paused here, so this covers the command landing; the mount swinging
        // toward it over time is covered by turret.spec.ts and the signals screen e2e
        await client.sendCommand(room, '/radars/1/directionCommand', { value: 20 });
        await waitForServer(() => Math.abs(shipManager.state.radars[1].directionCommand - 20) < 0.01);
        expect(shipManager.state.radars[1].directionCommand).toBeCloseTo(20, 2);
    });

    it('caps the scan beam radar arc to the @range of the field', async () => {
        const { client, room, shipId } = await connectShip('beam-capper');
        const shipManager = driver.serverDriver.getShip(shipId);
        const maxArc = shipManager.state.radars[1].design.maxArc;
        await client.sendCommand(room, '/radars/1/arc', { value: 9999 });
        await waitForServer(() => Math.abs(shipManager.state.radars[1].arc - maxArc) < 0.01);
        expect(shipManager.state.radars[1].arc).toBeCloseTo(maxArc, 2);
    });

    it('applies a GM write to warp.jammed (GM override lever, issue #2033)', async () => {
        const { client, room, shipId } = await connectShip('jam-toggle');
        const shipManager = driver.serverDriver.getShip(shipId);
        expect(shipManager.state.warp.jammed).toEqual(false);
        await client.sendCommand(room, '/warp/jammed', { value: true });
        await waitForServer(() => shipManager.state.warp.jammed === true);
        expect(shipManager.state.warp.jammed).toEqual(true);
    });
});
