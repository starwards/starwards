import { HTTP_CONFLICT_STATUS } from '../server';
import { getUnzipped } from '../serialization/game-state-serialization';
import { makeDriver } from './driver';
import supertest from 'supertest';

describe('server-API', () => {
    const gameDriver = makeDriver();

    it('convert player ship to NPC', async () => {
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'two_vs_one' }).expect(200);
        const shipId = gameDriver.gameManager.state.playerShipIds[0];
        await gameDriver.gameManager.convertShipType(shipId, false);
        expect(gameDriver.gameManager.state.playerShipIds).not.toContain(shipId);
    });

    it('convert NPC ship back to player', async () => {
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'two_vs_one' }).expect(200);
        const shipId = gameDriver.gameManager.state.playerShipIds[0];
        // Player → NPC
        await gameDriver.gameManager.convertShipType(shipId, false);
        expect(gameDriver.gameManager.state.playerShipIds).not.toContain(shipId);
        expect(gameDriver.gameManager.state.shipIds).toContain(shipId);
        // NPC → Player
        await gameDriver.gameManager.convertShipType(shipId, true);
        expect(gameDriver.gameManager.state.playerShipIds).toContain(shipId);
        expect(gameDriver.gameManager.state.shipIds).toContain(shipId);
    });

    it('player ships are not expendable, NPC ships are, at creation', async () => {
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'two_vs_one' }).expect(200);
        const playerShipId = gameDriver.gameManager.state.playerShipIds[0];
        const npcShipId = gameDriver.gameManager.state.shipIds.find(
            (id: string) => !gameDriver.gameManager.state.playerShipIds.includes(id),
        );
        expect(gameDriver.spaceManager.state.getShip(playerShipId)?.expendable).toBe(false);
        expect(gameDriver.spaceManager.state.getShip(npcShipId!)?.expendable).toBe(true);
    });

    it('converting a ship flips expendable to match its new type', async () => {
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'two_vs_one' }).expect(200);
        const shipId = gameDriver.gameManager.state.playerShipIds[0];
        await gameDriver.gameManager.convertShipType(shipId, false);
        expect(gameDriver.spaceManager.state.getShip(shipId)?.expendable).toBe(true);
        await gameDriver.gameManager.convertShipType(shipId, true);
        expect(gameDriver.spaceManager.state.getShip(shipId)?.expendable).toBe(false);
    });

    it('round-trip conversion produces no NaN in ship state after tick', async () => {
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'two_vs_one' }).expect(200);
        const shipId = gameDriver.gameManager.state.playerShipIds[0];

        // Player → NPC → Player
        await gameDriver.gameManager.convertShipType(shipId, false);
        await gameDriver.gameManager.convertShipType(shipId, true);

        // Run a game tick
        gameDriver.gameManager.update(1 / 20);

        // Check converted ship state for NaN
        const ship = gameDriver.getShip(shipId);
        expect(ship.state.boost).not.toBeNaN();
        expect(ship.state.strafe).not.toBeNaN();
    });

    it('duplicate convert commands are idempotent', async () => {
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'two_vs_one' }).expect(200);
        const shipId = gameDriver.gameManager.state.playerShipIds[0];
        // Concurrent conversions — guard prevents race
        await Promise.all([
            gameDriver.gameManager.convertShipType(shipId, false),
            gameDriver.gameManager.convertShipType(shipId, false),
        ]);
        expect(gameDriver.gameManager.state.playerShipIds).not.toContain(shipId);
        // shipIds should have exactly one entry for this ship
        expect(gameDriver.gameManager.state.shipIds.filter((id: string) => id === shipId)).toHaveLength(1);
    });

    it('start and stop a game (using gameManager API directly)', async () => {
        expect(gameDriver.gameManager.state.isGameRunning).toBe(false);
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'two_vs_one' }).expect(200);
        expect(gameDriver.gameManager.state.isGameRunning).toBe(true);
        await supertest(gameDriver.httpServer).post('/stop-game').expect(200);
        expect(gameDriver.gameManager.state.isGameRunning).toBe(false);
    });

    it('save game when not running returns 409 conflict', async () => {
        const response = await supertest(gameDriver.httpServer).post('/save-game');
        expect(response.status).toEqual(HTTP_CONFLICT_STATUS);
    });

    describe('save game functionality', () => {
        // start a paused game, so that no change is made to the state while the test is running
        beforeEach(async () => {
            gameDriver.pauseGameCommand();
            await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
            // the pause fix (#2022) keeps the loop running (draining commands, settling derived
            // state like radar sectors) even at speed 0 — run two deltaSeconds=0 ticks up front
            // (ShipState.spaceship mirrors the previous tick's radar sectors, so it needs one
            // extra tick to catch up) so settling isn't racing the background simulation
            // interval between the two saves
            gameDriver.gameManager.update(0);
            gameDriver.gameManager.update(0);
        });

        // In the following tests we use `getUnzipped()` to compare unzipped data
        // because zipped result is environment-dependent and sometimes depends on timestamps
        // see https://stackoverflow.com/a/26521451/11813

        it('saved game can be created and is non-empty', async () => {
            const response = await supertest(gameDriver.httpServer).post('/save-game').expect(200);

            expect(response.text).toBeTruthy();
            expect(response.text.length).toBeGreaterThan(100);

            const unzipped = await getUnzipped(response.text);
            expect(unzipped).toBeTruthy();
            expect(unzipped.length).toBeGreaterThan(0);
        });

        it('two save game operations return same data', async () => {
            const response = await supertest(gameDriver.httpServer).post('/save-game').expect(200);
            const response2 = await supertest(gameDriver.httpServer).post('/save-game').expect(200);
            expect(await getUnzipped(response.text)).toEqual(await getUnzipped(response2.text));
        });

        it('saved game contains same data as game state', async () => {
            const response = await supertest(gameDriver.httpServer).post('/save-game').expect(200);
            await gameDriver.assertSameState(response.text);
        });

        it('load saved game retains data', async () => {
            // create a save game
            const firstSaveGame = await supertest(gameDriver.httpServer).post('/save-game').expect(200);
            const savedGameRawData = firstSaveGame.text;
            await supertest(gameDriver.httpServer).post('/stop-game').expect(200);
            // load saved game
            await supertest(gameDriver.httpServer).post('/load-game').send({ data: savedGameRawData }).expect(200);
            // save again and compare
            const secondSaveGame = await supertest(gameDriver.httpServer).post('/save-game').expect(200);
            expect(await getUnzipped(secondSaveGame.text)).toEqual(await getUnzipped(firstSaveGame.text));
            await gameDriver.assertSameState(secondSaveGame.text);
        });
    });
});
