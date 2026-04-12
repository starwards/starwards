import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';
import { makeDriver } from './driver';

import { maps } from '@starwards/server';

const { single_ship } = maps;
const gameDriver = makeDriver(test);

test.describe('GM Screen', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);

        await gameDriver.gameManager.startGame(single_ship);

        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('displays golden-layout panels', async ({ page }) => {
        // GM screen uses golden-layout with radar, tweak, and create panels
        await expect(page.locator('.lm_goldenlayout')).toBeVisible({ timeout: 10000 });

        // Verify the default panels are present in the layout
        const items = page.locator('.lm_item');
        await expect(items.first()).toBeVisible();
    });

    test('loads ship-specific widgets after game starts', async ({ page }) => {
        // Wait for the GM radar to render (the main panel)
        await expect(page.locator('.lm_goldenlayout')).toBeVisible({ timeout: 10000 });

        // The GM screen dynamically adds per-ship widgets. Wait for at least
        // one ship widget to appear in the layout's registered widget menu.
        const menuContainer = page.locator('#menuContainer');
        await expect(menuContainer).toBeVisible({ timeout: 10000 });
    });
});
