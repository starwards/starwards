import { HTTP_CONFLICT_STATUS } from '../server';
import { getUnzipped } from '../admin/fragment-serialization';
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

    test('save game returns same data', async () => {
        gameDriver.pauseGameCommand();
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
        const response = await supertest(gameDriver.httpServer).post('/save-game');
        expect(response.status).toEqual(200);
        // compare unzipped data because zipped result is environment-dependent
        // see https://stackoverflow.com/a/26521451/11813
        expect(await getUnzipped(response.text)).toMatchSnapshot('test_map_1-save-game');
    });
});
