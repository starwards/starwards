import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { isBinaryRecording, sidecarName, waitFor } from '@starwards/core/internal';
import { test_map_1, two_vs_one } from '../maps';

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
    events?: string;
}

describe('recording HTTP API (issue #2101)', () => {
    const gameDriver = makeDriver();

    /** the name of the recording the running game is recorded to, once it has one */
    const recordingOf = async (mapName: string) => {
        await waitFor(() => expect(gameDriver.gameManager.state.recordingName).toMatch(`${mapName}_`), 5_000, 20);
        return gameDriver.gameManager.state.recordingName;
    };

    /** like `recordingOf`, once its first frame is written: a game stopped before that leaves no recording */
    const framedRecordingOf = async (mapName: string) => {
        const name = await recordingOf(mapName);
        await waitFor(
            async () => {
                const listed = (await supertest(gameDriver.httpServer).get('/recordings').expect(200))
                    .body as RecordingSummary[];
                expect(listed.find((r) => r.name === name)?.frameCount).toBeGreaterThan(0);
            },
            5_000,
            20,
        );
        return name;
    };

    /** starts a game and stops the recording it starts with, leaving the GM to record by hand */
    async function startUnrecordedGame() {
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
        await recordingOf('test_map_1');
        await supertest(gameDriver.httpServer).post('/stop-recording').expect(200);
    }

    it('POST /start-game records the game from its start', async () => {
        gameDriver.pauseGameCommand();
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
        const recordingName = await recordingOf('test_map_1');
        expect(recordingName).toMatch(/^test_map_1_\d+\.sgr$/);

        const stopRes = await supertest(gameDriver.httpServer).post('/stop-recording').expect(200);
        expect(stopRes.body).toMatchObject({ name: recordingName, mapName: 'test_map_1' });
    });

    it('records a game started on the manager directly', async () => {
        gameDriver.pauseGameCommand();
        await gameDriver.gameManager.startGame(test_map_1);
        const name = await framedRecordingOf('test_map_1');
        await gameDriver.gameManager.stopGame();
        await waitFor(() => expect(gameDriver.gameManager.state.isRecordingGame).toBe(false), 5_000, 20);
        const listed = (await supertest(gameDriver.httpServer).get('/recordings').expect(200))
            .body as RecordingSummary[];
        expect(listed.map((r) => r.name)).toEqual([name]);
    });

    it('gives each game its own recording, however quickly the next one starts', async () => {
        gameDriver.pauseGameCommand();
        await gameDriver.gameManager.startGame(test_map_1);
        const first = await framedRecordingOf('test_map_1');
        await gameDriver.gameManager.stopGame();
        await gameDriver.gameManager.startGame(two_vs_one);
        const second = await recordingOf('two_vs_one');
        await supertest(gameDriver.httpServer).post('/stop-recording').expect(200);

        const listed = (await supertest(gameDriver.httpServer).get('/recordings').expect(200))
            .body as RecordingSummary[];
        expect(listed.map((r) => r.name).sort()).toEqual([first, second].sort());
        expect(listed.find((r) => r.name === first)).toMatchObject({ mapName: 'test_map_1' });
    });

    it('a GM who stops the recording keeps it stopped for that game', async () => {
        gameDriver.pauseGameCommand();
        await startUnrecordedGame();
        await new Promise((res) => setTimeout(res, 300));
        expect(gameDriver.gameManager.state.isRecordingGame).toBe(false);
    });

    it('POST /start-recording rejects when no game is running', async () => {
        await supertest(gameDriver.httpServer).post('/start-recording').expect(HTTP_CONFLICT_STATUS);
    });

    it('POST /start-recording starts a recording; GET /recordings lists it after stopping', async () => {
        gameDriver.pauseGameCommand();
        await startUnrecordedGame();

        const startRes = await supertest(gameDriver.httpServer).post('/start-recording').expect(200);
        const startBody = startRes.body as StartRecordingResponse;
        expect(typeof startBody.name).toBe('string');
        expect(gameDriver.gameManager.state.isRecordingGame).toBe(true);

        await supertest(gameDriver.httpServer).post('/start-recording').expect(HTTP_CONFLICT_STATUS);

        await supertest(gameDriver.httpServer).post('/stop-recording').expect(200);
        expect(gameDriver.gameManager.state.isRecordingGame).toBe(false);

        const listRes = await supertest(gameDriver.httpServer).get('/recordings').expect(200);
        const recordings = listRes.body as RecordingSummary[];
        // the one the game started with, and the one started by hand
        expect(recordings).toHaveLength(2);
        expect(recordings.find((r) => r.name === startBody.name)).toMatchObject({ mapName: 'test_map_1' });
    });

    it('publishes the recording name and elapsed time, and confirms the file on stop', async () => {
        gameDriver.pauseGameCommand();
        await startUnrecordedGame();

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
        await startUnrecordedGame();
        await supertest(gameDriver.httpServer).post('/start-recording').expect(200);

        await supertest(gameDriver.httpServer).post('/stop-game').expect(200);

        expect(gameDriver.gameManager.state.isRecordingGame).toBe(false);
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'two_vs_one' }).expect(200);
        await recordingOf('two_vs_one');
    });

    it('GET /recordings/:name serves a recording, and rejects unknown or out-of-directory names', async () => {
        await startUnrecordedGame();
        const { name } = (await supertest(gameDriver.httpServer).post('/start-recording').expect(200))
            .body as StartRecordingResponse;
        await supertest(gameDriver.httpServer).post('/stop-recording').expect(200);
        await supertest(gameDriver.httpServer).post('/stop-game').expect(200);

        const res = await supertest(gameDriver.httpServer)
            .get(`/recordings/${name}`)
            .buffer(true)
            .parse((r, done) => {
                const chunks: Buffer[] = [];
                r.on('data', (chunk: Buffer) => chunks.push(chunk));
                r.on('end', () => done(null, Buffer.concat(chunks)));
            })
            .expect(200);
        expect(isBinaryRecording(res.body as Buffer)).toBe(true);

        await supertest(gameDriver.httpServer).get('/recordings/no-such-recording.sgr').expect(HTTP_NOT_FOUND_STATUS);
        for (const bad of ['notes.txt', '.sgr', '..%2F..%2Fetc%2Fpasswd']) {
            await supertest(gameDriver.httpServer).get(`/recordings/${bad}`).expect(HTTP_BAD_REQUEST_STATUS);
        }
    });

    it("serves and lists a recording's decision sidecar only when it exists", async () => {
        gameDriver.pauseGameCommand();
        await startUnrecordedGame();
        const { name } = (await supertest(gameDriver.httpServer).post('/start-recording').expect(200))
            .body as StartRecordingResponse;
        const stopRes = await supertest(gameDriver.httpServer).post('/stop-recording').expect(200);
        expect((stopRes.body as RecordingSummary).events).toBeUndefined();
        const list = async () =>
            ((await supertest(gameDriver.httpServer).get('/recordings').expect(200)).body as RecordingSummary[]).find(
                (r) => r.name === name,
            );
        expect((await list())?.events).toBeUndefined();

        const events = sidecarName(name);
        const line = '{"t":0,"kind":"decision","objectId":"GVTS","data":{}}\n';
        await fs.writeFile(path.join(gameDriver.recordingsDir, events), line, 'utf-8');

        expect(await list()).toMatchObject({ name, events });
        const res = await supertest(gameDriver.httpServer).get(`/recordings/${events}`).expect(200);
        expect(res.text).toEqual(line);
        for (const bad of ['a.jsonl', '.events.jsonl', '..%2Fa.events.jsonl']) {
            await supertest(gameDriver.httpServer).get(`/recordings/${bad}`).expect(HTTP_BAD_REQUEST_STATUS);
        }
    });
});
