import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { GameRecorder } from './game-recorder';
import { makeDriver } from '../test/driver';
import { parseFrameLine } from './recording-format';
import { waitFor } from '@starwards/core/internal';

async function readLines(filePath: string): Promise<string[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.split('\n').filter((l) => l.length > 0);
}

describe('GameRecorder', () => {
    const gameDriver = makeDriver();
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'starwards-recording-'));
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('rejects starting a recording when no game is running', async () => {
        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir);
        await expect(recorder.startRecording()).rejects.toThrow();
    });

    it('writes a header and frame 0 on start, and sets isRecordingGame', async () => {
        gameDriver.pauseGameCommand();
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);

        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 20);
        const filename = await recorder.startRecording();

        expect(gameDriver.gameManager.state.isRecordingGame).toBe(true);
        const lines = await readLines(path.join(tmpDir, filename));
        expect(lines).toHaveLength(2); // header + frame 0
        expect(parseFrameLine(lines[1])).not.toBeNull();

        await recorder.stopRecording();
    });

    it('rejects starting a second recording while one is already running', async () => {
        gameDriver.pauseGameCommand();
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 20);
        await recorder.startRecording();
        await expect(recorder.startRecording()).rejects.toThrow();
        await recorder.stopRecording();
    });

    it('dedupes frames while paused (totalSeconds not advancing)', async () => {
        gameDriver.pauseGameCommand(); // speed = 0, so background sim ticks never advance totalSeconds
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 15);
        const filename = await recorder.startRecording();

        await new Promise((res) => setTimeout(res, 200)); // let several intervals fire

        const lines = await readLines(path.join(tmpDir, filename));
        expect(lines).toHaveLength(2); // header + frame 0 only, no duplicate frames written

        await recorder.stopRecording();
    });

    it('writes monotonically increasing t once the game advances', async () => {
        gameDriver.gameManager.state.speed = 1;
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 15);
        const filename = await recorder.startRecording();

        await waitFor(
            async () => {
                const lines = await readLines(path.join(tmpDir, filename));
                if (lines.length < 3) throw new Error('waiting for more frames');
            },
            2000,
            20,
        );

        const lines = await readLines(path.join(tmpDir, filename));
        const frames = lines.slice(1).map((l) => parseFrameLine(l)!);
        for (let i = 1; i < frames.length; i++) {
            expect(frames[i].t).toBeGreaterThan(frames[i - 1].t);
        }

        await recorder.stopRecording();
    });

    it('auto-finalizes (stops itself, clears the flag) once the game stops', async () => {
        gameDriver.gameManager.state.speed = 1;
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 15);
        await recorder.startRecording();
        expect(gameDriver.gameManager.state.isRecordingGame).toBe(true);

        await gameDriver.gameManager.stopGame();

        await waitFor(
            () => {
                if (gameDriver.gameManager.state.isRecordingGame) throw new Error('still recording');
            },
            2000,
            20,
        );
    });

    it('stopRecording is idempotent', async () => {
        gameDriver.pauseGameCommand();
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 15);
        await recorder.startRecording();
        await recorder.stopRecording();
        await expect(recorder.stopRecording()).resolves.not.toThrow();
        expect(gameDriver.gameManager.state.isRecordingGame).toBe(false);
    });

    it('listRecordings summarizes name / mapName / startedAt / duration / frame count', async () => {
        gameDriver.gameManager.state.speed = 1;
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 15);
        const filename = await recorder.startRecording();

        await waitFor(
            async () => {
                const lines = await readLines(path.join(tmpDir, filename));
                if (lines.length < 3) throw new Error('waiting for more frames');
            },
            2000,
            20,
        );
        await recorder.stopRecording();

        const recordings = await recorder.listRecordings();
        expect(recordings).toHaveLength(1);
        expect(recordings[0]).toMatchObject({ name: filename, mapName: 'test_map_1' });
        expect(recordings[0].frameCount).toBeGreaterThanOrEqual(2);
        expect(recordings[0].durationSeconds).toBeGreaterThan(0);
    });
});
