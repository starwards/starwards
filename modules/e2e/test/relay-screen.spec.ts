import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { Page, expect, test } from '@playwright/test';
import { makeDriver } from './driver';

import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

test.describe('Relay Screen', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
        await navigateToScreen(page, `/relay.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('displays relay radar', async ({ page }) => {
        await expect(page.locator('[data-id="Relay Radar"]')).toBeVisible({ timeout: 10000 });
    });

    async function placeWaypoint(page: Page) {
        const radar = page.locator('[data-id="Relay Radar"]');
        await expect(radar).toBeVisible({ timeout: 10000 });

        // Press W to enter waypoint placement mode, then click the center of the radar
        await page.keyboard.press('w');
        const box = await radar.boundingBox();
        if (!box) throw new Error('Radar canvas not found');
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

        // Wait for waypoint to appear in server space state
        await expect
            .poll(() => [...gameDriver.gameManager.spaceManager.state.getAll('Waypoint')].length, {
                timeout: 3000,
                message: 'expected at least one waypoint to be created',
            })
            .toBeGreaterThan(0);
    }

    test('places waypoint when W is pressed and radar is clicked', async ({ page }) => {
        await placeWaypoint(page);
    });

    test('waypoint list: select, rename and delete via the item-list blade', async ({ page }) => {
        await placeWaypoint(page);
        const waypointsPane = page.locator('[data-id="Waypoints"]');
        await expect(waypointsPane.locator('.tp-itemlistv_row')).toHaveCount(1);

        // Pick the waypoint from the dropdown to open the Edit section
        await waypointsPane.locator('.tp-itemlistv_trigger').click();
        await waypointsPane.locator('.tp-itemlistv_option').first().click();

        // Rename via the Edit section's name input
        const nameInput = waypointsPane.locator('input[type="text"]').first();
        await expect(nameInput).toBeVisible();
        await nameInput.fill('Alpha');
        await nameInput.press('Enter');
        await expect
            .poll(() => [...gameDriver.gameManager.spaceManager.state.getAll('Waypoint')][0]?.title, {
                timeout: 3000,
            })
            .toBe('Alpha');
        await expect(waypointsPane.locator('.tp-itemlistv_value')).toContainText('Alpha');

        // Delete via the item row's remove (✕) button
        await waypointsPane.locator('.tp-itemlistv_remove-btn').click();
        await expect
            .poll(() => [...gameDriver.gameManager.spaceManager.state.getAll('Waypoint')].length, {
                timeout: 3000,
            })
            .toBe(0);
        await expect(waypointsPane.locator('.tp-itemlistv_row')).toHaveCount(0);
    });

    test('layers pane lists radar layers and removes them from the visible set', async ({ page }) => {
        const layersPane = page.locator('[data-id="Layers"]');
        await expect(layersPane).toBeVisible({ timeout: 10000 });
        // sensor range, grid, objects, waypoints
        await expect(layersPane.locator('.tp-itemlistv_row')).toHaveCount(4);

        await layersPane.locator('.tp-itemlistv_remove-btn').first().click();
        await expect(layersPane.locator('.tp-itemlistv_row')).toHaveCount(3);

        // Re-add it from the dropdown
        await layersPane.locator('.tp-itemlistv_trigger').click();
        await layersPane.locator('.tp-itemlistv_option').first().click();
        await expect(layersPane.locator('.tp-itemlistv_row')).toHaveCount(4);
    });
});
