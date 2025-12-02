import { expect, test } from '@playwright/test';

import { makeDriver } from './driver';

const gameDriver = makeDriver(test);

test('start and stop a game', async ({ page }) => {
    await page.goto(`${gameDriver.baseURL}/`);
    await expect(page.locator('[data-id="title"]')).toHaveText('Starwards');
    expect(gameDriver.gameManager.state.isGameRunning).toBe(false);
    const newGame = page.locator('[data-id="new game"]').first();
    await newGame.click({ delay: 200 });
    await newGame.waitFor({ state: 'detached' });
    expect(gameDriver.gameManager.state.isGameRunning).toBe(true);
    // Use .first() to handle potential duplicate elements
    await page.locator('[data-id="stop game"]').first().click({ delay: 200 });
    await newGame.first().waitFor({ state: 'visible' });
    expect(gameDriver.gameManager.state.isGameRunning).toBe(false);
});
