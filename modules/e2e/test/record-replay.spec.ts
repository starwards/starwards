import { expect, test } from '@playwright/test';

import { makeDriver } from './driver';
import { maps } from '@starwards/server';

const gameDriver = makeDriver(test);
const { single_ship } = maps;

test('a recorded game opens from the lobby in the recording player, with no game running', async ({ page }) => {
    await gameDriver.gameManager.startGame(single_ship);
    await page.request.post(`${gameDriver.baseURL}/start-recording`);
    await page.waitForTimeout(2500); // a couple of frames past frame 0
    await page.request.post(`${gameDriver.baseURL}/stop-recording`);
    await page.request.post(`${gameDriver.baseURL}/stop-game`);

    await page.goto(`${gameDriver.baseURL}/`);
    const recording = page.locator('[data-id^="recording "]').first();
    await expect(recording).toBeVisible();
    await recording.click({ delay: 200 });

    await expect(page).toHaveURL(/player\.html\?src=/);
    await expect(page.locator('[data-id="time"]')).toContainText('/');
    await expect(page.locator('[data-id="GM Radar"]')).toBeVisible();
    await expect(page.locator('#menuContainer')).toContainText(`${single_ship.testShipId} helm`);
});
