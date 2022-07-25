import { HTTP_CONFLICT_STATUS } from '../server';
import { getUnzipped } from '../serialization/game-state-serialization';
import { makeDriver } from './driver';
import supertest from 'supertest';

describe('server-API', () => {
    const gameDriver = makeDriver();

    test('start and stop a game (using gameManager API directly)', async () => {
        expect(gameDriver.gameManager.state.isGameRunning).toBe(false);
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'two_vs_one' }).expect(200);
        expect(gameDriver.gameManager.state.isGameRunning).toBe(true);
        await supertest(gameDriver.httpServer).post('/stop-game').expect(200);
        expect(gameDriver.gameManager.state.isGameRunning).toBe(false);
    });

    test('save game when not running returns 409 conflict', async () => {
        const response = await supertest(gameDriver.httpServer).post('/save-game');
        expect(response.status).toEqual(HTTP_CONFLICT_STATUS);
    });

    // regression test: dont break compatibility unknowingly
    test('save game returns same data', async () => {
        gameDriver.pauseGameCommand();
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
        const response = await supertest(gameDriver.httpServer).post('/save-game').expect(200);
        // compare unzipped data because zipped result is environment-dependent
        // see https://stackoverflow.com/a/26521451/11813
        expect(await getUnzipped(response.text)).toMatchSnapshot('test_map_1-save-game');
    });

    test('two save game operations return same data', async () => {
        gameDriver.pauseGameCommand();
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
        const response = await supertest(gameDriver.httpServer).post('/save-game').expect(200);
        const response2 = await supertest(gameDriver.httpServer).post('/save-game').expect(200);
        expect(await getUnzipped(response.text)).toEqual(await getUnzipped(response2.text));
    });

    test('saved game contains same data as game state', async () => {
        gameDriver.pauseGameCommand();
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
        const response = await supertest(gameDriver.httpServer).post('/save-game').expect(200);
        await gameDriver.assertSameState(response.text);
    });

    test('load saved game retains data', async () => {
        gameDriver.pauseGameCommand();

        // create a save game
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
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
