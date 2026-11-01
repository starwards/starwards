import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { Driver, Explosion, SavedGame, Vec2, sleep, waitFor } from '@starwards/core/internal';
import { makeDriver } from '../test/driver';
import { savedGameToSchema } from '../serialization/game-state-serialization';
import { wave_defence } from '../maps';

describe('a loaded game', () => {
    const gameDriver = makeDriver();

    it('lets a client join a ship room', async () => {
        const manager = gameDriver.gameManager;
        await manager.startGame(wave_defence);
        for (let i = 0; i < 10; i++) manager.update(0.1);
        manager.spaceManager.insert(new Explosion().init('blast', new Vec2(100, 0), 1));
        manager.update(0.01);
        await manager.loadGame(manager.saveGame()!, wave_defence);
        const driver = new Driver(new URL(gameDriver.url())).connect();
        try {
            const shipId = manager.state.playerShipIds[0];
            const joined = await Promise.race([
                driver.getShipDriver(shipId).then((s) => s.state.spaceship.id),
                new Promise((r) => setTimeout(() => r('timed out'), 10_000)),
            ]);
            expect({ joined }).toEqual({ joined: shipId });
            const space = await Promise.race([
                driver.getSpaceDriver(),
                new Promise<undefined>((r) => setTimeout(() => r(undefined), 10_000)),
            ]);
            expect(space).toBeDefined();
            await waitFor(() => expect(space!.state.get('blast')?.type).toBe('Explosion'), 5_000);
        } finally {
            driver.destroy();
        }
    });
});

describe('a game loaded from a recording frame', () => {
    jest.setTimeout(120_000);
    const gameDriver = makeDriver();

    it('keeps a space client in sync as objects come and go', async () => {
        const manager = gameDriver.gameManager;
        // wave_defence at 1380 s, mid-fight, from a recording whose bots failed to join once loaded
        const file = await fs.readFile(path.join(__dirname, '__fixtures__', 'wave-defence-frame.sg'));
        const warnings: string[] = [];
        const capture = (...a: unknown[]) => {
            const text = a.map(String).join(' ');
            if (/DecodingWarning|non-existing|was expected/.test(text) && warnings.length < 5)
                warnings.push(text.slice(0, 160));
        };
        const warn = jest.spyOn(console, 'warn').mockImplementation(capture);
        const error = jest.spyOn(console, 'error').mockImplementation(capture);
        await manager.loadGame(await savedGameToSchema(SavedGame, file), wave_defence);
        const driver = new Driver(new URL(gameDriver.url())).connect();
        try {
            await driver.getSpaceDriver();
            for (let i = 0; i < 1200; i++) {
                manager.update(0.05);
                await sleep(1);
            }
            expect(warnings).toEqual([]);
        } finally {
            warn.mockRestore();
            error.mockRestore();
            driver.destroy();
        }
    });
});
