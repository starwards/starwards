import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
    AdminDriver,
    Driver,
    isBinaryRecording,
    parseEventLine,
    waitFor,
    zstSidecarName,
} from '@starwards/core/internal';

import { makeDriver } from './test/driver';
import { readSidecarLines } from './recording/sidecar-file';
import supertest from 'supertest';
import { two_vs_one } from './maps';

jest.setTimeout(60_000);

const readDecisions = (file: string) =>
    (() => {
        try {
            return readSidecarLines(file);
        } catch {
            return [];
        }
    })()
        .map((l) => parseEventLine(l))
        .filter((e) => e?.kind === 'decision');

describe('a game is recorded from its start', () => {
    const gameDriver = makeDriver();
    let driver: Driver;
    let admin: AdminDriver;

    afterEach(() => {
        driver.destroy();
    });

    it("keeps a bot's decisions without the GM pressing record", async () => {
        await gameDriver.gameManager.startGame(two_vs_one);
        await waitFor(() => expect(gameDriver.gameManager.state.recordingName).not.toBe(''), 5_000, 20);
        const { recordingName } = gameDriver.gameManager.state;
        const recording = path.join(gameDriver.recordingsDir, recordingName);
        const sidecar = zstSidecarName(recording);

        driver = new Driver(new URL(gameDriver.url())).connect();
        admin = await driver.getAdminDriver();
        admin.assignBot({ shipId: 'GVTS', seat: 'pilot', brain: 'reference' });
        await waitFor(() => expect(readDecisions(sidecar).length).toBeGreaterThan(0), 30_000, 200);

        await supertest(gameDriver.httpServer).post('/stop-game').expect(200);

        expect(gameDriver.gameManager.state.isRecordingGame).toBe(false);
        expect(isBinaryRecording(await fs.readFile(recording))).toBe(true);
        expect(readDecisions(sidecar).length).toBeGreaterThan(0);
    });
});
