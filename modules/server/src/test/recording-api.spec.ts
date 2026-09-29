import { HTTP_CONFLICT_STATUS } from '../server';
import { makeDriver } from './driver';
import supertest from 'supertest';

const HTTP_BAD_REQUEST_STATUS = 400;
const HTTP_NOT_FOUND_STATUS = 404;

interface StartRecordingResponse {
    name: string;
}
interface RecordingSummary {
    name: string;
    mapName: string;
    frameCount: number;
}

describe('recording HTTP API (issue #2101)', () => {
    const gameDriver = makeDriver();

    it('POST /start-recording rejects when no game is running', async () => {
        await supertest(gameDriver.httpServer).post('/start-recording').expect(HTTP_CONFLICT_STATUS);
    });

    it('POST /start-recording starts a recording; GET /recordings lists it after stopping', async () => {
        gameDriver.pauseGameCommand();
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);

        const startRes = await supertest(gameDriver.httpServer).post('/start-recording').expect(200);
        const startBody = startRes.body as StartRecordingResponse;
        expect(typeof startBody.name).toBe('string');
        expect(gameDriver.gameManager.state.isRecordingGame).toBe(true);

        await supertest(gameDriver.httpServer).post('/start-recording').expect(HTTP_CONFLICT_STATUS);

        await supertest(gameDriver.httpServer).post('/stop-recording').expect(200);
        expect(gameDriver.gameManager.state.isRecordingGame).toBe(false);

        const listRes = await supertest(gameDriver.httpServer).get('/recordings').expect(200);
        const recordings = listRes.body as RecordingSummary[];
        expect(recordings).toHaveLength(1);
        expect(recordings[0]).toMatchObject({ name: startBody.name, mapName: 'test_map_1' });
    });

    it('publishes the recording name and elapsed time, and confirms the file on stop', async () => {
        gameDriver.pauseGameCommand();
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);

        const startRes = await supertest(gameDriver.httpServer).post('/start-recording').expect(200);
        const { name } = startRes.body as StartRecordingResponse;
        expect(gameDriver.gameManager.state.recordingName).toEqual(name);

        const stopRes = await supertest(gameDriver.httpServer).post('/stop-recording').expect(200);
        expect(stopRes.body).toMatchObject({ name, mapName: 'test_map_1' });
        expect((stopRes.body as RecordingSummary).frameCount).toBeGreaterThan(0);
        expect(gameDriver.gameManager.state.recordingName).toEqual('');
        expect(gameDriver.gameManager.state.recordingSeconds).toEqual(0);
    });

    it('POST /stop-game stops an active recording before another game can start', async () => {
        gameDriver.pauseGameCommand();
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
        await supertest(gameDriver.httpServer).post('/start-recording').expect(200);

        await supertest(gameDriver.httpServer).post('/stop-game').expect(200);

        expect(gameDriver.gameManager.state.isRecordingGame).toBe(false);
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'two_vs_one' }).expect(200);
        expect(gameDriver.gameManager.state.isRecordingGame).toBe(false);
    });

    it('GET /recordings/:name serves a recording, and rejects unknown or out-of-directory names', async () => {
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
        const { name } = (await supertest(gameDriver.httpServer).post('/start-recording').expect(200))
            .body as StartRecordingResponse;
        await supertest(gameDriver.httpServer).post('/stop-recording').expect(200);
        await supertest(gameDriver.httpServer).post('/stop-game').expect(200);

        const res = await supertest(gameDriver.httpServer).get(`/recordings/${name}`).expect(200);
        expect(res.text.split('\n')[0]).toContain('starwards-recording');

        await supertest(gameDriver.httpServer)
            .get('/recordings/no-such-recording.swr.jsonl')
            .expect(HTTP_NOT_FOUND_STATUS);
        for (const bad of ['notes.txt', '.swr.jsonl', '..%2F..%2Fetc%2Fpasswd']) {
            await supertest(gameDriver.httpServer).get(`/recordings/${bad}`).expect(HTTP_BAD_REQUEST_STATUS);
        }
    });
});
