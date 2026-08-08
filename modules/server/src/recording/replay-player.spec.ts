import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { GameStatus, waitFor } from '@starwards/core/internal';
import { encodeFrameLine, encodeHeader } from './recording-format';

import { ReplayPlayer } from './replay-player';
import { SavedGame } from '../serialization/game-state-protocol';
import { makeDriver } from '../test/driver';
import { schemaToString } from '../serialization/game-state-serialization';

async function writeRecording(filePath: string, mapName: string, frames: Array<{ t: number; game: SavedGame }>) {
    let content = encodeHeader({
        format: 'starwards-recording',
        version: 1,
        mapName,
        startedAt: new Date(0).toISOString(),
        intervalMs: 1000,
    });
    for (const { t, game } of frames) {
        content += encodeFrameLine({ t, frame: await schemaToString(game) });
    }
    await fs.writeFile(filePath, content, 'utf-8');
}

describe('ReplayPlayer', () => {
    const gameDriver = makeDriver();
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'starwards-replay-'));
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    async function recordedFramesFromLiveGame(mapName: 'test_map_1' | 'two_vs_one') {
        gameDriver.pauseGameCommand();
        await gameDriver.gameManager.startGame((await import('../maps'))[mapName]);
        gameDriver.gameManager.update(0);
        const frame0 = gameDriver.gameManager.saveGame() as SavedGame;
        return frame0;
    }

    it('loads frame 0 and enters REPLAY status', async () => {
        const frame0 = await recordedFramesFromLiveGame('test_map_1');
        await gameDriver.gameManager.stopGame();
        const file = path.join(tmpDir, 'rec.swr.jsonl');
        await writeRecording(file, 'test_map_1', [{ t: 0, game: frame0 }]);

        const player = new ReplayPlayer(
            gameDriver.gameManager,
            new Map([[(await import('../maps')).test_map_1.name, (await import('../maps')).test_map_1]]),
        );
        await player.startReplay(file);

        expect(gameDriver.gameManager.state.gameStatus).toBe(GameStatus.REPLAY);
        player.stop();
    });

    it('tracks position across recorded frames as the replay clock advances, skipping intermediates', async () => {
        const frame0 = await recordedFramesFromLiveGame('test_map_1');
        const shipId = gameDriver.gameManager.state.playerShipIds[0];

        const frame1 = frame0.clone();
        frame1.fragment.space.getShip(shipId)!.position.x = 111;
        const frame2 = frame0.clone();
        frame2.fragment.space.getShip(shipId)!.position.x = 222;

        await gameDriver.gameManager.stopGame();
        const file = path.join(tmpDir, 'rec.swr.jsonl');
        await writeRecording(file, 'test_map_1', [
            { t: 0, game: frame0 },
            { t: 1, game: frame1 },
            { t: 2, game: frame2 },
        ]);

        const maps = await import('../maps');
        const player = new ReplayPlayer(gameDriver.gameManager, new Map([[maps.test_map_1.name, maps.test_map_1]]));
        await player.startReplay(file);

        // jump straight past both frame1 and frame2's timestamps: should land on frame2, not frame1
        await player.advanceTo(5);
        expect(gameDriver.spaceManager.state.getShip(shipId)!.position.x).toBe(222);

        player.stop();
    });

    it('does not advance before the next frame timestamp is reached', async () => {
        const frame0 = await recordedFramesFromLiveGame('test_map_1');
        const shipId = gameDriver.gameManager.state.playerShipIds[0];
        const originalX = gameDriver.spaceManager.state.getShip(shipId)!.position.x;

        const frame1 = frame0.clone();
        frame1.fragment.space.getShip(shipId)!.position.x = 999;

        await gameDriver.gameManager.stopGame();
        const file = path.join(tmpDir, 'rec.swr.jsonl');
        await writeRecording(file, 'test_map_1', [
            { t: 0, game: frame0 },
            { t: 10, game: frame1 },
        ]);

        const maps = await import('../maps');
        const player = new ReplayPlayer(gameDriver.gameManager, new Map([[maps.test_map_1.name, maps.test_map_1]]));
        await player.startReplay(file);

        await player.advanceTo(1); // still well before frame1's t=10
        expect(gameDriver.spaceManager.state.getShip(shipId)!.position.x).toBe(originalX);

        player.stop();
    });

    it('at end of recording: applies the last frame, pauses, and sets a message, staying in REPLAY', async () => {
        const frame0 = await recordedFramesFromLiveGame('test_map_1');
        const shipId = gameDriver.gameManager.state.playerShipIds[0];
        const frame1 = frame0.clone();
        frame1.fragment.space.getShip(shipId)!.position.x = 555;

        await gameDriver.gameManager.stopGame();
        const file = path.join(tmpDir, 'rec.swr.jsonl');
        await writeRecording(file, 'test_map_1', [
            { t: 0, game: frame0 },
            { t: 1, game: frame1 },
        ]);

        const maps = await import('../maps');
        const player = new ReplayPlayer(gameDriver.gameManager, new Map([[maps.test_map_1.name, maps.test_map_1]]));
        await player.startReplay(file);
        await player.advanceTo(100); // past the end

        expect(gameDriver.spaceManager.state.getShip(shipId)!.position.x).toBe(555);
        expect(gameDriver.gameManager.state.speed).toBe(0);
        expect(gameDriver.gameManager.state.message).toBe('Replay ended');
        expect(gameDriver.gameManager.state.gameStatus).toBe(GameStatus.REPLAY);

        player.stop();
    });

    it('tears down a ship room when the ship disappears mid-replay', async () => {
        const frame0 = await recordedFramesFromLiveGame('two_vs_one');
        const removedShipId = gameDriver.gameManager.state.playerShipIds[0];

        const frame1 = frame0.clone();
        frame1.fragment.ship.delete(removedShipId);
        frame1.fragment.space.delete(frame1.fragment.space.getShip(removedShipId)!);

        await gameDriver.gameManager.stopGame();
        const file = path.join(tmpDir, 'rec.swr.jsonl');
        await writeRecording(file, 'two_vs_one', [
            { t: 0, game: frame0 },
            { t: 1, game: frame1 },
        ]);

        const maps = await import('../maps');
        const player = new ReplayPlayer(gameDriver.gameManager, new Map([[maps.two_vs_one.name, maps.two_vs_one]]));
        await player.startReplay(file);
        expect(gameDriver.gameManager.state.shipIds).toContain(removedShipId);

        await player.advanceTo(5);

        await waitFor(
            () => {
                if (gameDriver.gameManager.state.shipIds.includes(removedShipId)) {
                    throw new Error('still waiting for ship room teardown');
                }
            },
            2000,
            20,
        );

        player.stop();
    });

    it('stopGame() returns a replay to STOPPED', async () => {
        const frame0 = await recordedFramesFromLiveGame('test_map_1');
        await gameDriver.gameManager.stopGame();
        const file = path.join(tmpDir, 'rec.swr.jsonl');
        await writeRecording(file, 'test_map_1', [{ t: 0, game: frame0 }]);

        const maps = await import('../maps');
        const player = new ReplayPlayer(gameDriver.gameManager, new Map([[maps.test_map_1.name, maps.test_map_1]]));
        await player.startReplay(file);
        player.stop();
        await gameDriver.gameManager.stopGame();

        expect(gameDriver.gameManager.state.gameStatus).toBe(GameStatus.STOPPED);
    });

    it('rejects starting a replay while a game is already running', async () => {
        await recordedFramesFromLiveGame('test_map_1');
        const file = path.join(tmpDir, 'rec.swr.jsonl');
        const maps = await import('../maps');
        const player = new ReplayPlayer(gameDriver.gameManager, new Map([[maps.test_map_1.name, maps.test_map_1]]));
        await expect(player.startReplay(file)).rejects.toThrow();
    });
});
