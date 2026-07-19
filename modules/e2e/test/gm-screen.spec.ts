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

    test('tweak panel shows velocity, targetId and radarRange for a selected spaceship', async ({ page }) => {
        const radarCanvas = page.locator('[data-id="GM Radar"]');
        await expect(radarCanvas).toBeVisible({ timeout: 15000 });

        // the single_ship map spawns the player ship at world (0,0), which the
        // default (unpanned, zoom=1) GM camera maps to the canvas center.
        const box = await radarCanvas.boundingBox();
        if (!box) throw new Error('GM Radar canvas has no bounding box');
        await radarCanvas.click({ position: { x: box.width / 2, y: box.height / 2 } });

        const tweakPanel = page.locator('[data-id="Tweaks"]');
        await expect(tweakPanel.getByText('velocity', { exact: true })).toBeVisible({ timeout: 5000 });
        await expect(tweakPanel.getByText('radarRange', { exact: true })).toBeVisible();
        // 'targetId' also appears inside the (unrelated, collapsed) Docking system
        // folder further down the panel; the ship-level one we add is the first
        // in DOM order since it's wired up before the per-system folders loop.
        await expect(tweakPanel.getByText('targetId', { exact: true }).first()).toBeVisible();
    });

    test('velocity set via the tweak panel persists (does not get thrusted away by the smart pilot)', async ({
        page,
    }) => {
        const radarCanvas = page.locator('[data-id="GM Radar"]');
        await expect(radarCanvas).toBeVisible({ timeout: 15000 });

        const box = await radarCanvas.boundingBox();
        if (!box) throw new Error('GM Radar canvas has no bounding box');
        await radarCanvas.click({ position: { x: box.width / 2, y: box.height / 2 } });

        const tweakPanel = page.locator('[data-id="Tweaks"]');
        const velocityLabel = tweakPanel.getByText('velocity', { exact: true });
        await expect(velocityLabel).toBeVisible({ timeout: 5000 });
        const velocityInputs = velocityLabel.locator('..').locator('input');

        await velocityInputs.nth(0).fill('50');
        await velocityInputs.nth(0).press('Enter');
        await velocityInputs.nth(1).fill('-30');
        await velocityInputs.nth(1).press('Enter');

        // The ship's own smart pilot (velocity-hold by default) would otherwise thrust a
        // GM-forced velocity away again within a tick or two; give it ample time to prove
        // the value sticks instead of just checking immediately after the write.
        const [ship] = gameDriver.gameManager.spaceManager.state.getAll('Spaceship');
        await expect(() => {
            expect(ship.velocity.x).toBeCloseTo(50, 0);
            expect(ship.velocity.y).toBeCloseTo(-30, 0);
        }).toPass({ timeout: 2000 });
        // ...and stays put a bit longer, ruling out a slow decay back towards zero.
        await page.waitForTimeout(1000);
        expect(ship.velocity.x).toBeCloseTo(50, 0);
        expect(ship.velocity.y).toBeCloseTo(-30, 0);
    });

    test('radius set via the tweak panel takes effect', async ({ page }) => {
        const radarCanvas = page.locator('[data-id="GM Radar"]');
        await expect(radarCanvas).toBeVisible({ timeout: 15000 });

        const box = await radarCanvas.boundingBox();
        if (!box) throw new Error('GM Radar canvas has no bounding box');
        await radarCanvas.click({ position: { x: box.width / 2, y: box.height / 2 } });

        const tweakPanel = page.locator('[data-id="Tweaks"]');
        // 'radius' is a plain numeric input (not the angle-oriented `cameraring` dial), so it
        // has a single input, same shape as the label lookup used for velocity's x/y pair.
        const radiusLabel = tweakPanel.getByText('radius', { exact: true }).first();
        await expect(radiusLabel).toBeVisible({ timeout: 5000 });
        const radiusInput = radiusLabel.locator('..').locator('input').first();

        await radiusInput.fill('120');
        await radiusInput.press('Enter');

        const [ship] = gameDriver.gameManager.spaceManager.state.getAll('Spaceship');
        await expect(() => {
            expect(ship.radius).toBeCloseTo(120, 0);
        }).toPass({ timeout: 2000 });
    });
});
