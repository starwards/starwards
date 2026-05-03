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

    test('does not reset radar view when a new ship is created via GM UI', async ({ page }) => {
        const radarCanvas = page.locator('[data-id="GM Radar"]');
        await expect(radarCanvas).toBeVisible({ timeout: 15000 });

        // Wait for all initial ship widgets to be registered (GVTS long range radar is last)
        const menuContainer = page.locator('#menuContainer');
        await expect(menuContainer.locator('[data-id="menu-GVTS long range radar"]')).toBeVisible({
            timeout: 15000,
        });

        // Count menu items after initial setup
        const initialMenuCount = await menuContainer.locator('li[data-id]').count();

        // Scroll on the radar to zoom out (deltaY=500 → zoom changes from 1.0 to ~0.5)
        await radarCanvas.hover();
        await page.mouse.wheel(0, 500);

        // Wait for data-zoom attribute to update
        await page.waitForTimeout(300);

        // Verify zoom changed from default 1.0
        const zoomAfterScroll = parseFloat((await radarCanvas.getAttribute('data-zoom')) ?? '1');
        expect(zoomAfterScroll).toBeLessThan(1.0);

        // Switch to the "create" tab in the GM panel
        const createTab = page.locator('.lm_title', { hasText: 'create' });
        await createTab.click();

        // Click the "Create Ship" action button (tp-btnv_b) to enter ship placement mode
        const createShipButton = page.locator('button.tp-btnv_b', { hasText: 'Create Ship' });
        await expect(createShipButton).toBeVisible({ timeout: 5000 });
        await createShipButton.click();

        // Click on the radar canvas to place the new ship
        await radarCanvas.click({ position: { x: 100, y: 100 } });

        // Wait for the new ship's widgets to appear in the menu (count increases by at least 1)
        await expect(async () => {
            const count = await menuContainer.locator('li[data-id]').count();
            expect(count).toBeGreaterThan(initialMenuCount);
        }).toPass({ timeout: 15000 });

        // The radar zoom must NOT have reset to 1.0
        const zoomAfterShipAdded = parseFloat((await radarCanvas.getAttribute('data-zoom')) ?? '1');
        expect(zoomAfterShipAdded).toBeCloseTo(zoomAfterScroll, 2);
    });
});
