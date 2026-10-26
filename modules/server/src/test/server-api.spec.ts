import { HTTP_CONFLICT_STATUS } from '../server';
import { isBinarySavedGame } from '@starwards/core/internal';
import { makeDriver } from './driver';
import { schemaToString } from '../serialization/game-state-serialization';
import supertest from 'supertest';

describe('server-API', () => {
    const gameDriver = makeDriver({ manualClock: true });

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
        beforeEach(async () => {
            gameDriver.pauseGameCommand();
            await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
            // settle derived state (radar sectors) before saving: ShipState.spaceship mirrors the
            // previous tick's sectors, so it takes two ticks to catch up
            gameDriver.gameManager.update(0);
            gameDriver.gameManager.update(0);
        });

        const saveGame = async () => {
            const response = await supertest(gameDriver.httpServer)
                .post('/save-game')
                .buffer(true)
                .parse((res, cb) => {
                    const chunks: Buffer[] = [];
                    res.on('data', (c: Buffer) => chunks.push(c));
                    res.on('end', () => cb(null, Buffer.concat(chunks)));
                })
                .expect(200);
            return response.body as Buffer;
        };
        const loadGame = (file: Buffer) =>
            supertest(gameDriver.httpServer)
                .post('/load-game')
                .set('Content-Type', 'application/octet-stream')
                .send(file);

        it('saved game is a non-empty binary file', async () => {
            const file = await saveGame();
            expect(isBinarySavedGame(file)).toBe(true);
            expect(file.length).toBeGreaterThan(100);
        });

        it('two save game operations return same data', async () => {
            expect(await saveGame()).toEqual(await saveGame());
        });

        it('saved game contains same data as game state', async () => {
            await gameDriver.assertSameState(await saveGame());
        });

        it('load saved game retains data', async () => {
            const first = await saveGame();
            await supertest(gameDriver.httpServer).post('/stop-game').expect(200);
            await loadGame(first).expect(200);
            const second = await saveGame();
            expect(second).toEqual(first);
            await gameDriver.assertSameState(second);
        });

        it('loads a saved game in the older text format, as a file or as JSON', async () => {
            const text = await schemaToString(gameDriver.gameManager.saveGame()!);
            await supertest(gameDriver.httpServer).post('/stop-game').expect(200);
            await loadGame(Buffer.from(text)).expect(200);
            expect(gameDriver.gameManager.state.isGameRunning).toBe(true);
            await supertest(gameDriver.httpServer).post('/stop-game').expect(200);
            await supertest(gameDriver.httpServer).post('/load-game').send({ data: text }).expect(200);
            expect(gameDriver.gameManager.state.isGameRunning).toBe(true);
        });

        it('refuses a truncated or corrupt saved game with 400', async () => {
            const file = await saveGame();
            await supertest(gameDriver.httpServer).post('/stop-game').expect(200);
            await loadGame(file.subarray(0, file.length - 4)).expect(400);
            await loadGame(Buffer.from('garbage')).expect(400);
            expect(gameDriver.gameManager.state.isGameRunning).toBe(false);
        });
    });
});
