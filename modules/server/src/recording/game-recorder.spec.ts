import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
    EVENTS_ZST_EXT,
    POWER_DRAW_EXPONENT,
    RECORDING_EXT,
    RecordingRecord,
    parseEventLine,
    waitFor,
    zstSidecarName,
} from '@starwards/core/internal';
import { GameRecorder, RecordingConflictError, isRecordingFileName } from './game-recorder';
import { makeDriver } from '../test/driver';
import { readRecords } from './recording-file';
import { readSidecarLines } from './sidecar-file';
import { writeTextRecording } from '../test/text-recording-fixture';

async function readSgr(filePath: string): Promise<RecordingRecord[]> {
    const records: RecordingRecord[] = [];
    for await (const record of readRecords(filePath)) records.push(record);
    return records;
}

/** these cases pin the v1 (keyframes only) behavior; delta recording has its own spec */
const keyframesOnly = () => false;

describe('GameRecorder', () => {
    const gameDriver = makeDriver({ recordEveryGame: false });
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

        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 20, keyframesOnly);
        const filename = await recorder.startRecording();

        expect(gameDriver.gameManager.state.isRecordingGame).toBe(true);
        const lines = await readSgr(path.join(tmpDir, filename));
        expect(lines).toHaveLength(2); // header + frame 0
        expect(lines[1].kind).toBe('frame');
        expect(lines[0]).toMatchObject({ header: { energyModel: { powerDrawExponent: POWER_DRAW_EXPONENT } } });

        await recorder.stopRecording();
    });

    it('reports an unwritable recordings dir as an I/O failure, not a conflict', async () => {
        gameDriver.pauseGameCommand();
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        const blocked = path.join(tmpDir, 'a-file');
        await fs.writeFile(blocked, 'not a directory', 'utf-8');
        const recorder = new GameRecorder(gameDriver.gameManager, path.join(blocked, 'recordings'), 15, keyframesOnly);

        await expect(recorder.startRecording()).rejects.not.toBeInstanceOf(RecordingConflictError);
        expect(gameDriver.gameManager.state.isRecordingGame).toBe(false);
    });

    it('rejects starting a second recording while one is already running', async () => {
        gameDriver.pauseGameCommand();
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 20, keyframesOnly);
        await recorder.startRecording();
        await expect(recorder.startRecording()).rejects.toThrow();
        await recorder.stopRecording();
    });

    it('dedupes frames while paused (totalSeconds not advancing)', async () => {
        gameDriver.pauseGameCommand(); // speed = 0, so background sim ticks never advance totalSeconds
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 15, keyframesOnly);
        const filename = await recorder.startRecording();

        await new Promise((res) => setTimeout(res, 200)); // let several intervals fire

        const lines = await readSgr(path.join(tmpDir, filename));
        expect(lines).toHaveLength(2); // header + frame 0 only, no duplicate frames written

        await recorder.stopRecording();
    });

    it('writes monotonically increasing t once the game advances', async () => {
        gameDriver.gameManager.state.speed = 1;
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 15, keyframesOnly);
        const filename = await recorder.startRecording();

        await waitFor(
            async () => {
                const lines = await readSgr(path.join(tmpDir, filename));
                if (lines.length < 3) throw new Error('waiting for more frames');
            },
            2000,
            20,
        );

        const lines = await readSgr(path.join(tmpDir, filename));
        const frames = lines.flatMap((r) => (r.kind === 'frame' ? [r] : []));
        for (let i = 1; i < frames.length; i++) {
            expect(frames[i].t).toBeGreaterThan(frames[i - 1].t);
        }

        await recorder.stopRecording();
    });

    it('removes a recording the game stopped before its first frame, with no sidecar', async () => {
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 15, keyframesOnly);
        const starting = recorder.startRecording();
        recorder.appendEvent({ kind: 'decision' });
        await gameDriver.gameManager.stopGame();
        await expect(starting).rejects.toThrow(RecordingConflictError);
        await waitFor(
            async () => {
                expect(await fs.readdir(tmpDir)).toEqual([]);
            },
            2000,
            20,
        );
        expect(await recorder.listRecordings()).toEqual([]);
    });

    it('auto-finalizes (stops itself, clears the flag) once the game stops', async () => {
        gameDriver.gameManager.state.speed = 1;
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 15, keyframesOnly);
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

    it('never appends to a finalized file, even while the timer keeps firing', async () => {
        gameDriver.gameManager.state.speed = 1;
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 15, keyframesOnly);
        const filename = await recorder.startRecording();
        await recorder.stopRecording();

        const linesAtStop = (await readSgr(path.join(tmpDir, filename))).length;
        await new Promise((res) => setTimeout(res, 200)); // several intervals' worth
        expect(await readSgr(path.join(tmpDir, filename))).toHaveLength(linesAtStop);
    });

    it('stopRecording is idempotent', async () => {
        gameDriver.pauseGameCommand();
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 15, keyframesOnly);
        await recorder.startRecording();
        await recorder.stopRecording();
        await expect(recorder.stopRecording()).resolves.not.toThrow();
        expect(gameDriver.gameManager.state.isRecordingGame).toBe(false);
    });

    it('lists recordings newest first', async () => {
        gameDriver.pauseGameCommand();
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 15, keyframesOnly);
        const older = await recorder.startRecording();
        await recorder.stopRecording();
        await new Promise((res) => setTimeout(res, 5)); // distinct startedAt / filename
        const newer = await recorder.startRecording();
        await recorder.stopRecording();

        expect((await recorder.listRecordings()).map((r) => r.name)).toEqual([newer, older]);
    });

    it('listRecordings summarizes name / mapName / startedAt / duration / frame count', async () => {
        gameDriver.gameManager.state.speed = 1;
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 15, keyframesOnly);
        const filename = await recorder.startRecording();

        await waitFor(
            async () => {
                const lines = await readSgr(path.join(tmpDir, filename));
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

    it('summarizes a text-format file with delta lines by its keyframes only, also with a truncated delta tail', async () => {
        gameDriver.gameManager.state.speed = 1;
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 15, keyframesOnly);
        const filename = await recorder.startRecording();
        await waitFor(
            async () => {
                const lines = await readSgr(path.join(tmpDir, filename));
                if (lines.length < 4) throw new Error('waiting for more frames');
            },
            2000,
            20,
        );
        await recorder.stopRecording();
        const [v1] = await recorder.listRecordings();
        const v2Dir = path.join(tmpDir, 'v2');
        await fs.mkdir(v2Dir);
        const v2Recorder = new GameRecorder(gameDriver.gameManager, v2Dir);
        await writeTextRecording(path.join(tmpDir, filename), path.join(v2Dir, 'whole.sgr'), { deltas: true });
        await writeTextRecording(path.join(tmpDir, filename), path.join(v2Dir, 'truncated.sgr'), {
            deltas: true,
            truncateTail: true,
        });

        const summaries = await v2Recorder.listRecordings();
        expect(summaries).toHaveLength(2);
        for (const summary of summaries) {
            expect(summary.frameCount).toBe(v1.frameCount);
            expect(summary.durationSeconds).toBe(v1.durationSeconds);
        }
        expect(v1.durationSeconds).toBeGreaterThan(0);
    });

    describe('decision sidecar', () => {
        const decision = { kind: 'decision', objectId: 'GVTS', data: {} };
        const sidecars = async () => (await fs.readdir(tmpDir)).filter((n) => n.endsWith(EVENTS_ZST_EXT));

        it('appends events only while recording, beside the .sgr, on the recording clock', async () => {
            gameDriver.gameManager.state.speed = 1;
            await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
            const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 15, keyframesOnly);
            const changes: boolean[] = [];
            recorder.onRecordingChange = (on) => changes.push(on);

            recorder.appendEvent(decision);
            const filename = await recorder.startRecording();
            recorder.appendEvent(decision);
            await new Promise((res) => setTimeout(res, 50));
            recorder.appendEvent(decision);
            const summary = await recorder.stopRecording();
            recorder.appendEvent(decision);
            await new Promise((res) => setTimeout(res, 20));

            const sidecar = zstSidecarName(filename);
            expect(await sidecars()).toEqual([sidecar]);
            const events = readSidecarLines(path.join(tmpDir, sidecar)).map(parseEventLine);
            expect(events).toHaveLength(2);
            expect(events[0]).toMatchObject(decision);
            expect(events[0]!.t).toBeGreaterThanOrEqual(0);
            expect(events[1]!.t).toBeGreaterThanOrEqual(events[0]!.t);
            expect(summary?.events).toEqual(sidecar);
            expect(changes).toEqual([true, false]);
        });

        it('completes the sidecar before a recording that ends with its game reports itself done', async () => {
            const realFs = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
            const appendFile = realFs.appendFile.bind(realFs);
            const slowSidecar = jest.spyOn(realFs, 'appendFile').mockImplementation(async (file, data, options) => {
                if (typeof file === 'string' && file.endsWith(EVENTS_ZST_EXT))
                    await new Promise((res) => setTimeout(res, 300));
                return appendFile(file, data, options);
            });
            try {
                gameDriver.gameManager.state.speed = 1;
                await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
                const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 15, keyframesOnly);
                const ended = new Promise<void>((resolve) => {
                    recorder.onRecordingChange = (on) => {
                        if (!on) resolve();
                    };
                });
                const filename = await recorder.startRecording();
                recorder.appendEvent(decision);
                await gameDriver.gameManager.stopGame();
                await ended;

                const lines = readSidecarLines(path.join(tmpDir, zstSidecarName(filename)));
                expect(lines.map(parseEventLine)).toEqual([expect.objectContaining(decision)]);
            } finally {
                slowSidecar.mockRestore();
            }
        });

        it('keeps an event sent as soon as bots are told to record, writing it after the .sgr header', async () => {
            const realFs = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
            const appendFile = realFs.appendFile.bind(realFs);
            const headerFirst: boolean[] = [];
            const spy = jest.spyOn(realFs, 'appendFile').mockImplementation(async (file, data, options) => {
                if (typeof file === 'string' && file.endsWith(EVENTS_ZST_EXT)) {
                    const sgr = file.slice(0, -EVENTS_ZST_EXT.length) + RECORDING_EXT;
                    headerFirst.push((await readSgr(sgr)).some((r) => r.kind === 'header'));
                }
                return appendFile(file, data, options);
            });
            try {
                gameDriver.pauseGameCommand();
                await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
                const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 20, keyframesOnly);
                // bots are told to record before the header is written: what they send at once is kept
                recorder.onRecordingChange = (on) => on && recorder.appendEvent(decision);
                const filename = await recorder.startRecording();
                await recorder.stopRecording();

                const lines = readSidecarLines(path.join(tmpDir, zstSidecarName(filename)));
                expect(lines.map(parseEventLine)).toEqual([expect.objectContaining(decision)]);
                expect(headerFirst).toEqual([true]);
            } finally {
                spy.mockRestore();
            }
        });

        it('writes no sidecar for a recording without events', async () => {
            gameDriver.pauseGameCommand();
            await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
            const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 20, keyframesOnly);
            await recorder.startRecording();
            const summary = await recorder.stopRecording();
            expect(await sidecars()).toEqual([]);
            expect(summary?.events).toBeUndefined();
            expect((await recorder.listRecordings())[0].events).toBeUndefined();
        });

        it('lists the sidecar with its recording', async () => {
            gameDriver.pauseGameCommand();
            await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
            const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 20, keyframesOnly);
            const filename = await recorder.startRecording();
            recorder.appendEvent(decision);
            await recorder.stopRecording();
            expect(await recorder.listRecordings()).toEqual([
                expect.objectContaining({ name: filename, events: zstSidecarName(filename) }),
            ]);
        });

        it('isRecordingFileName accepts plain recording and sidecar names only', () => {
            expect(isRecordingFileName('a_1.events.jsonl')).toBe(true);
            expect(isRecordingFileName('a_1.events.jsonl.zst')).toBe(true);
            expect(isRecordingFileName('.events.jsonl.zst')).toBe(false);
            expect(isRecordingFileName('../a.events.jsonl.zst')).toBe(false);
            expect(isRecordingFileName('a_1.sgr')).toBe(true);
            expect(isRecordingFileName('../a.events.jsonl')).toBe(false);
            expect(isRecordingFileName('a.jsonl')).toBe(false);
            expect(isRecordingFileName('.events.jsonl')).toBe(false);
        });
    });
});
