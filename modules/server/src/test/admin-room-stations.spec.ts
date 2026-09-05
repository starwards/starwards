import { makeMultiClientDriver } from './multi-client-driver';
import { sleep } from '@starwards/core/internal';
import supertest from 'supertest';

// Behavior tests for the station registry (issue #2131): every browser/MCP station
// registers itself, with an optional ship self-assignment request, over the admin room's
// `registerStation` command. `AdminState.stations` (a MapSchema<StationRegistryEntry>) is
// the resulting roster the GM screen renders.

describe('AdminRoom station registry', () => {
    const driver = makeMultiClientDriver();
    if (process.env.CI) {
        jest.setTimeout(100_000);
    }

    async function connectAdmin(name: string) {
        const client = driver.createClient(name);
        const room = await client.connectAdmin();
        await client.waitForSync(room);
        return { client, room };
    }

    async function startGame(mapName: string) {
        await supertest(driver.serverDriver.httpServer).post('/stop-game').send({}).expect(200);
        await supertest(driver.serverDriver.httpServer).post('/start-game').send({ mapName }).expect(200);
    }

    async function waitForServer(predicate: () => boolean, timeoutMs = 5000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            if (predicate()) return;
            await sleep(50);
        }
        throw new Error(`waitForServer timeout after ${timeoutMs}ms`);
    }

    function registerStation(
        client: Awaited<ReturnType<typeof driver.createClient>>,
        room: Awaited<ReturnType<typeof client.connectAdmin>>,
        stationId: string,
        stationType: string,
        shipId = '',
    ) {
        return client.sendCommand(room, 'registerStation', { value: { stationId, stationType, shipId } });
    }

    function stationEntry(stationId: string) {
        return driver.serverDriver.gameManager.state.stations.get(stationId);
    }

    describe('two-ship map', () => {
        beforeEach(() => startGame('two_vs_one'));

        it('registers stations and marks them connected', async () => {
            const a = await connectAdmin('station-a');
            const b = await connectAdmin('station-b');
            await registerStation(a.client, a.room, 'AAA', 'engineer', 'GVTS');
            await registerStation(b.client, b.room, 'BBB', 'weapons', 'GVTS');
            await waitForServer(() => stationEntry('AAA')?.connected === true);
            await waitForServer(() => stationEntry('BBB')?.connected === true);
            expect(stationEntry('AAA')).toMatchObject({
                id: 'AAA',
                stationType: 'engineer',
                shipId: 'GVTS',
                connected: true,
            });
            expect(stationEntry('BBB')).toMatchObject({
                id: 'BBB',
                stationType: 'weapons',
                shipId: 'GVTS',
                connected: true,
            });
        });

        it('normalizes a lower-case station id to upper-case', async () => {
            const a = await connectAdmin('lowercase-id');
            await registerStation(a.client, a.room, 'lower-case', 'engineer', 'GVTS');
            await waitForServer(() => stationEntry('LOWER-CASE')?.connected === true);
        });

        it('drops a malformed station id (invalid charset or too long)', async () => {
            const a = await connectAdmin('malformed-id');
            await registerStation(a.client, a.room, 'not a valid id!', 'engineer', 'GVTS');
            await registerStation(a.client, a.room, 'A'.repeat(17), 'engineer', 'GVTS');
            // give the server a few ticks to (not) create either entry
            await sleep(300);
            expect(stationEntry('not a valid id!')).toBeUndefined();
            expect(stationEntry('A'.repeat(17))).toBeUndefined();
        });

        it('rejects a self-assignment to a ship that is not a player ship', async () => {
            const a = await connectAdmin('bad-ship-request');
            await registerStation(a.client, a.room, 'CCC', 'signals', 'NOT-A-SHIP-XYZ');
            await waitForServer(() => stationEntry('CCC')?.connected === true);
            expect(stationEntry('CCC')?.shipId).toBe('');
        });

        it('does not auto-assign a station when more than one slot is open for its type', async () => {
            const a = await connectAdmin('roaming-relay');
            await registerStation(a.client, a.room, 'DDD', 'relay');
            await waitForServer(() => stationEntry('DDD')?.connected === true);
            // both GVTS and GVTS2 have an open 'relay' slot: give the server a few more ticks
            // to (not) auto-assign before asserting it stayed unassigned.
            await sleep(300);
            expect(stationEntry('DDD')?.shipId).toBe('');
        });

        it('rejects a registerStation for an id already connected under a different session', async () => {
            const owner = await connectAdmin('owner');
            await registerStation(owner.client, owner.room, 'DUP', 'pilot');
            await waitForServer(() => stationEntry('DUP')?.connected === true);

            const impostor = await connectAdmin('impostor');
            const rejections: string[] = [];
            impostor.room.onMessage('registerStationRejected', (msg: { stationId: string }) =>
                rejections.push(msg.stationId),
            );
            await registerStation(impostor.client, impostor.room, 'DUP', 'weapons');
            await waitForServer(() => rejections.includes('DUP'));
            // the original owner's registration is untouched by the rejected request
            expect(stationEntry('DUP')).toMatchObject({ stationType: 'pilot', connected: true });
        });

        it('retires the old station id when the same session registers under a new one (rename)', async () => {
            const renamer = await connectAdmin('renamer');
            await registerStation(renamer.client, renamer.room, 'OLD', 'pilot', 'GVTS');
            await waitForServer(() => stationEntry('OLD')?.shipId === 'GVTS');

            await registerStation(renamer.client, renamer.room, 'NEW', 'pilot', 'GVTS');
            await waitForServer(() => stationEntry('NEW')?.connected === true);
            await waitForServer(() => stationEntry('OLD')?.connected === false);
            // the retired entry's sticky assignment is untouched — only `connected` flips
            expect(stationEntry('OLD')?.shipId).toBe('GVTS');
        });
    });

    it('auto-assigns the sole open slot for a station type', async () => {
        await startGame('weapons_multi_tube'); // single player ship: GVTS-2TUBE
        const a = await connectAdmin('auto-pilot');
        await registerStation(a.client, a.room, 'EEE', 'pilot');
        await waitForServer(() => stationEntry('EEE')?.shipId === 'GVTS-2TUBE');
    });

    it('keeps the registry across a stop/start cycle and re-validates the assignment', async () => {
        await startGame('weapons_no_tubes'); // single player ship: GVTS-0TUBE
        const a = await connectAdmin('sticky-station');
        await registerStation(a.client, a.room, 'FFF', 'pilot', 'GVTS-0TUBE');
        await waitForServer(() => stationEntry('FFF')?.shipId === 'GVTS-0TUBE');

        await supertest(driver.serverDriver.httpServer).post('/stop-game').send({}).expect(200);
        expect(stationEntry('FFF')?.shipId).toBe('GVTS-0TUBE');

        await supertest(driver.serverDriver.httpServer)
            .post('/start-game')
            .send({ mapName: 'weapons_no_tubes' })
            .expect(200);
        await waitForServer(() => stationEntry('FFF')?.shipId === 'GVTS-0TUBE');
    });

    it('clears an assignment whose ship is no longer a player ship after a map switch', async () => {
        await startGame('weapons_no_tubes');
        const a = await connectAdmin('stale-assignment');
        await registerStation(a.client, a.room, 'HHH', 'engineer', 'GVTS-0TUBE');
        await waitForServer(() => stationEntry('HHH')?.shipId === 'GVTS-0TUBE');

        await startGame('two_vs_one'); // GVTS-0TUBE no longer exists
        await waitForServer(() => stationEntry('HHH')?.shipId === '');
    });

    it('reconnecting with the same station id keeps its assignment and flips connected', async () => {
        await startGame('weapons_multi_gun'); // single player ship: GVTS-3GUN
        const a = await connectAdmin('reconnecting');
        await registerStation(a.client, a.room, 'GGG', 'pilot', 'GVTS-3GUN');
        await waitForServer(() => stationEntry('GGG')?.shipId === 'GVTS-3GUN');

        await a.room.leave(true);
        await waitForServer(() => stationEntry('GGG')?.connected === false);
        expect(stationEntry('GGG')?.shipId).toBe('GVTS-3GUN');

        const b = await connectAdmin('reconnecting-again');
        await registerStation(b.client, b.room, 'GGG', 'pilot', 'GVTS-3GUN');
        await waitForServer(() => stationEntry('GGG')?.connected === true);
        expect(stationEntry('GGG')?.shipId).toBe('GVTS-3GUN');
    });
});
