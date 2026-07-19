import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';
import { makeDriver } from './driver';

import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

test.describe('Signals Screen', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
        await navigateToScreen(page, `/signals.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('displays long range radar', async ({ page }) => {
        await expect(page.locator('[data-id="Long Range Radar"]')).toBeVisible({ timeout: 10000 });
    });
});
