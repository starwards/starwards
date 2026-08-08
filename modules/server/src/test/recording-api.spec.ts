import { GameStatus, waitFor } from '@starwards/core/internal';

import { HTTP_CONFLICT_STATUS } from '../server';
import { makeDriver } from './driver';
import supertest from 'supertest';

const HTTP_BAD_REQUEST_STATUS = 400;

interface StartRecordingResponse {
    name: string;
}
interface RecordingSummary {
    name: string;
    mapName: string;
    frameCount: number;
}

describe('recording/replay HTTP API (issue #2101)', () => {
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

    it('POST /stop-game stops an active recording before another game can start', async () => {
        gameDriver.pauseGameCommand();
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
        await supertest(gameDriver.httpServer).post('/start-recording').expect(200);

        await supertest(gameDriver.httpServer).post('/stop-game').expect(200);

        expect(gameDriver.gameManager.state.isRecordingGame).toBe(false);
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'two_vs_one' }).expect(200);
        expect(gameDriver.gameManager.state.isRecordingGame).toBe(false);
    });

    it('POST /start-replay rejects a missing name with 400', async () => {
        await supertest(gameDriver.httpServer).post('/start-replay').send({}).expect(HTTP_BAD_REQUEST_STATUS);
    });

    it('POST /start-replay rejects an unknown recording with 400', async () => {
        await supertest(gameDriver.httpServer)
            .post('/start-replay')
            .send({ name: 'no-such-recording.swr.jsonl' })
            .expect(HTTP_BAD_REQUEST_STATUS);
    });

    it.each(['../../../etc/passwd', '..\\..\\secret.swr.jsonl', 'sub/dir.swr.jsonl', '.swr.jsonl', 'notes.txt'])(
        'POST /start-replay rejects the out-of-directory name %p with 400',
        async (name) => {
            await supertest(gameDriver.httpServer).post('/start-replay').send({ name }).expect(HTTP_BAD_REQUEST_STATUS);
        },
    );

    it('POST /start-replay rejects while a game is running with 409', async () => {
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
        await supertest(gameDriver.httpServer)
            .post('/start-replay')
            .send({ name: 'anything.swr.jsonl' })
            .expect(HTTP_CONFLICT_STATUS);
    });

    it('records a game, then replays it end-to-end via HTTP; /stop-game ends the replay', async () => {
        gameDriver.gameManager.state.speed = 1;
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
        const startRes = await supertest(gameDriver.httpServer).post('/start-recording').expect(200);
        const { name } = startRes.body as StartRecordingResponse;

        await waitFor(
            async () => {
                const list = await supertest(gameDriver.httpServer).get('/recordings').expect(200);
                const recordings = list.body as RecordingSummary[];
                if (!recordings.length || recordings[0].frameCount < 1) throw new Error('waiting for a frame');
            },
            2000,
            20,
        );

        await supertest(gameDriver.httpServer).post('/stop-recording').expect(200);
        await supertest(gameDriver.httpServer).post('/stop-game').expect(200);
        expect(gameDriver.gameManager.state.isGameRunning).toBe(false);

        await supertest(gameDriver.httpServer).post('/start-replay').send({ name }).expect(200);
        expect(gameDriver.gameManager.state.gameStatus).toBe(GameStatus.REPLAY);

        await supertest(gameDriver.httpServer).post('/stop-game').expect(200);
        expect(gameDriver.gameManager.state.gameStatus).toBe(GameStatus.STOPPED);
    });
});
