import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { restoreGameSnapshot, startSnapshotPersistence, writeGameSnapshot } from '../snapshot/snapshot-persistence';

import { SavedGame } from '../serialization/game-state-protocol';
import { makeDriver } from './driver';
import { schemaToString } from '../serialization/game-state-serialization';
import { waitFor } from '@starwards/core/internal';

async function fileExists(filePath: string) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

describe('snapshot-persistence', () => {
    const gameDriver = makeDriver();
    let tmpDir: string;
    let snapshotFile: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'starwards-snapshot-'));
        snapshotFile = path.join(tmpDir, 'game-snapshot.b64');
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('writeGameSnapshot returns false when no game is running', async () => {
        expect(await writeGameSnapshot(gameDriver.gameManager, snapshotFile)).toBe(false);
        expect(await fileExists(snapshotFile)).toBe(false);
    });

    it('writeGameSnapshot writes a snapshot file for a running game', async () => {
        gameDriver.pauseGameCommand();
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        // the pause fix (#2022) keeps the loop running (settling derived state like radar
        // sectors) even at speed 0 — run two deltaSeconds=0 ticks (ShipState.spaceship mirrors
        // the previous tick's radar sectors, so it needs one extra tick to catch up) so the
        // snapshot isn't racing the background simulation interval against the later
        // live-state comparison
        gameDriver.gameManager.update(0);
        gameDriver.gameManager.update(0);
        expect(await writeGameSnapshot(gameDriver.gameManager, snapshotFile)).toBe(true);
        const content = await fs.readFile(snapshotFile, 'utf-8');
        expect(content.length).toBeGreaterThan(100);
        await gameDriver.assertSameState(content);
    });

    it('restoreGameSnapshot restores the saved game state', async () => {
        gameDriver.pauseGameCommand();
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        gameDriver.gameManager.update(0);
        gameDriver.gameManager.update(0);
        await writeGameSnapshot(gameDriver.gameManager, snapshotFile);
        await gameDriver.gameManager.stopGame();
        expect(gameDriver.gameManager.state.isGameRunning).toBe(false);

        expect(await restoreGameSnapshot(gameDriver.gameManager, snapshotFile)).toBe(true);

        expect(gameDriver.gameManager.state.isGameRunning).toBe(true);
        const content = await fs.readFile(snapshotFile, 'utf-8');
        await gameDriver.assertSameState(content);
    });

    it('restoreGameSnapshot returns false when snapshot file does not exist', async () => {
        expect(await restoreGameSnapshot(gameDriver.gameManager, snapshotFile)).toBe(false);
        expect(gameDriver.gameManager.state.isGameRunning).toBe(false);
    });

    it('restoreGameSnapshot returns false for a corrupt snapshot file', async () => {
        await fs.writeFile(snapshotFile, 'this is not a valid snapshot', 'utf-8');
        expect(await restoreGameSnapshot(gameDriver.gameManager, snapshotFile)).toBe(false);
        expect(gameDriver.gameManager.state.isGameRunning).toBe(false);
    });

    it('restoreGameSnapshot returns false for an unknown map name', async () => {
        const savedGame = new SavedGame();
        savedGame.mapName = 'no_such_map';
        await fs.writeFile(snapshotFile, await schemaToString(savedGame), 'utf-8');
        expect(await restoreGameSnapshot(gameDriver.gameManager, snapshotFile)).toBe(false);
        expect(gameDriver.gameManager.state.isGameRunning).toBe(false);
    });

    it('startSnapshotPersistence periodically writes snapshots and stop() halts writing', async () => {
        gameDriver.pauseGameCommand();
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        gameDriver.gameManager.update(0);
        gameDriver.gameManager.update(0);
        const stop = startSnapshotPersistence(gameDriver.gameManager, snapshotFile, 20);
        try {
            await waitFor(
                async () => {
                    if (!(await fileExists(snapshotFile))) {
                        throw new Error('waiting for snapshot file');
                    }
                },
                2000,
                20,
            );
            await gameDriver.assertSameState(await fs.readFile(snapshotFile, 'utf-8'));
        } finally {
            await stop();
        }
        // after stop(), no further writes should occur
        await fs.rm(snapshotFile);
        await new Promise((res) => setTimeout(res, 100));
        expect(await fileExists(snapshotFile)).toBe(false);
    });

    it('startSnapshotPersistence does not write while no game is running', async () => {
        const stop = startSnapshotPersistence(gameDriver.gameManager, snapshotFile, 20);
        try {
            await new Promise((res) => setTimeout(res, 100));
            expect(await fileExists(snapshotFile)).toBe(false);
        } finally {
            await stop();
        }
    });
});
