import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';

import { makeDriver } from './driver';
import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

test.describe('GM broadcast', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('a message typed on the GM screen reaches a station and fills the history', async ({ page, context }) => {
        test.setTimeout(60_000);
        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });
        await page.locator('.lm_title', { hasText: 'broadcast' }).click();
        await expect(page.locator('[data-id="GM Broadcast"]')).toBeVisible({ timeout: 10000 });

        const station = await context.newPage();
        setupPageErrorHandlers(station);
        await navigateToScreen(station, `/helms.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
        await expect(station.locator('[data-id="Helms Radar"]')).toBeVisible({ timeout: 10000 });
        await expect(station.locator('[data-id="Game Message"]')).toBeHidden();
        await page.bringToFront();

        const send = page.locator('[data-id="Broadcast Send"]');
        await expect(send).toBeDisabled();
        await expect(page.locator('[data-id="Broadcast History Empty"]')).toBeVisible();

        await page.locator('[data-id="Broadcast Text"]').fill('All hands, brace for impact');
        await send.click();
        await page.locator('[data-id="Broadcast Text"]').fill('Second call');
        await page.locator('[data-id="Broadcast Text"]').press('Enter');

        await expect(station.locator('[data-id="Game Message"]')).toHaveText('All hands, brace for impact', {
            timeout: 10000,
        });
        const entries = page.locator('[data-id="Broadcast History Entry"]');
        await expect(entries).toHaveCount(2, { timeout: 10000 });
        await expect(entries.nth(0)).toContainText('Second call');
        await expect(entries.nth(1)).toContainText('All hands, brace for impact');
        await expect(page.locator('[data-id="Broadcast Text"]')).toHaveValue('');
        expect(gameDriver.gameManager.state.messageHistory.map((m) => m.text)).toEqual([
            'All hands, brace for impact',
            'Second call',
        ]);
    });
});
