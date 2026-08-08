import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';

import { makeDriver } from './driver';
import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

test.describe('Station screen standby lifecycle', () => {
    test.beforeEach(({ page }) => {
        setupPageErrorHandlers(page);
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('shows standby before a game exists, then initializes, stops and restarts without reloading', async ({
        page,
    }) => {
        // no game running yet
        await navigateToScreen(page, `/pilot.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });

        await expect(page.locator('[data-id="Standby"]')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('[data-id="Pilot Radar"]')).toHaveCount(0);

        // mark the page instance so a later reload is detectable
        await page.evaluate(() => {
            (window as unknown as { __e2eLoadMarker: boolean }).__e2eLoadMarker = true;
        });

        await gameDriver.gameManager.startGame(single_ship);

        await expect(page.locator('[data-id="Pilot Radar"]')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('[data-id="Standby"]')).toHaveCount(0);
        expect(await page.evaluate(() => (window as unknown as { __e2eLoadMarker?: boolean }).__e2eLoadMarker)).toBe(
            true,
        );

        await gameDriver.gameManager.stopGame();

        await expect(page.locator('[data-id="Standby"]')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('[data-id="Pilot Radar"]')).toHaveCount(0);
        expect(await page.evaluate(() => (window as unknown as { __e2eLoadMarker?: boolean }).__e2eLoadMarker)).toBe(
            true,
        );

        await gameDriver.gameManager.startGame(single_ship);

        await expect(page.locator('[data-id="Pilot Radar"]')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('[data-id="Standby"]')).toHaveCount(0);
        expect(await page.evaluate(() => (window as unknown as { __e2eLoadMarker?: boolean }).__e2eLoadMarker)).toBe(
            true,
        );
    });
});
