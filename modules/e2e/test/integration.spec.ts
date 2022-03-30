import * as path from 'path';

import { expect, test } from '@playwright/test';

import { GameManager } from '@starwards/server/src/admin/game-manager';
import { server } from '@starwards/server/src/server';

let gameManager: GameManager | null = null;
test.beforeAll(async () => {
    gameManager = new GameManager();
    await server(8080, path.resolve(__dirname, '..', '..', '..', 'static'), gameManager);
});

test('start and stop a game', async ({ page }) => {
    await page.goto(`/`);
    await expect(page.locator('[data-id="title"]')).toHaveText('Starwards');
    expect(gameManager?.state.isGameRunning).toBe(false);
    const newGame = page.locator('[data-id="new game"]');
    await newGame.click({ delay: 200 });
    await newGame.waitFor({ state: 'detached' });
    expect(gameManager?.state.isGameRunning).toBe(true);
    await page.locator('[data-id="stop game"]').click({ delay: 200 });
    await newGame.waitFor({ state: 'visible' });
    expect(gameManager?.state.isGameRunning).toBe(false);
});
