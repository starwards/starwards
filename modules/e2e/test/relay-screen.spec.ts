import { Page, expect, test } from '@playwright/test';
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
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

    function serverWaypoints() {
        return [...gameDriver.gameManager.spaceManager.state.getAll('Waypoint')];
    }

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
            .poll(() => serverWaypoints().length, {
                timeout: 3000,
                message: 'expected at least one waypoint to be created',
            })
            .toBeGreaterThan(0);
    }

    async function clickRadarCenter(page: Page) {
        const radar = page.locator('[data-id="Relay Radar"]');
        const box = await radar.boundingBox();
        if (!box) throw new Error('Radar canvas not found');
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }

    test('displays relay radar', async ({ page }) => {
        await expect(page.locator('[data-id="Relay Radar"]')).toBeVisible({ timeout: 10000 });
    });

    test('places waypoint when W is pressed and radar is clicked', async ({ page }) => {
        await placeWaypoint(page);
    });

    test('selecting a waypoint on the radar opens the edit pane; rename and delete', async ({ page }) => {
        await placeWaypoint(page);
        const editPane = page.locator('[data-id="Edit Waypoint"]');
        await expect(editPane).toBeHidden();

        // Click the waypoint on the radar to select it
        await clickRadarCenter(page);
        await expect(editPane).toBeVisible();

        // Rename via the edit pane's name input
        const nameInput = editPane.locator('input[type="text"]').first();
        await nameInput.fill('Alpha');
        await nameInput.press('Enter');
        await expect.poll(() => serverWaypoints()[0]?.title, { timeout: 3000 }).toBe('Alpha');

        // Delete via the edit pane
        await editPane.getByRole('button', { name: 'Delete' }).click();
        await expect.poll(() => serverWaypoints().length, { timeout: 3000 }).toBe(0);
        await expect(editPane).toBeHidden();
    });

    test('waypoint list: select via dropdown and delete via ✕', async ({ page }) => {
        await placeWaypoint(page);
        const waypointsPane = page.locator('[data-id="Waypoints"]');
        await expect(waypointsPane.locator('.tp-itemlistv_row')).toHaveCount(1);

        // Picking the waypoint from the dropdown selects it, opening the edit pane
        await waypointsPane.locator('.tp-itemlistv_trigger').click();
        await waypointsPane.locator('.tp-itemlistv_option').first().click();
        await expect(page.locator('[data-id="Edit Waypoint"]')).toBeVisible();

        // Delete via the item row's remove (✕) button
        await waypointsPane.locator('.tp-itemlistv_remove-btn').click();
        await expect.poll(() => serverWaypoints().length, { timeout: 3000 }).toBe(0);
        await expect(waypointsPane.locator('.tp-itemlistv_row')).toHaveCount(0);
    });

    test('clone to group creates a copy and a new waypoint-group layer toggle', async ({ page }) => {
        await placeWaypoint(page);
        await clickRadarCenter(page);
        const editPane = page.locator('[data-id="Edit Waypoint"]');
        await expect(editPane).toBeVisible();

        // The group name input is the text input after the name input
        await editPane.locator('input[type="text"]').nth(1).fill('patrol');
        await editPane.getByRole('button', { name: 'Clone' }).click();

        await expect.poll(() => serverWaypoints().length, { timeout: 3000 }).toBe(2);
        const clone = serverWaypoints().find((wp) => wp.collection === 'patrol');
        expect(clone).toBeTruthy();
        expect(clone?.owner).toBe(shipId);

        // A layer toggle for the new group appears in the Layers pane
        const layersPane = page.locator('[data-id="Layers"]');
        await expect(layersPane.getByText('waypoints: patrol')).toBeVisible();
    });

    test('layers pane has a boolean toggle per layer, including dynamic waypoint groups', async ({ page }) => {
        const layersPane = page.locator('[data-id="Layers"]');
        await expect(layersPane).toBeVisible({ timeout: 10000 });
        // static layers: sensor range, grid, objects
        await expect(layersPane.locator('input[type="checkbox"]')).toHaveCount(3);

        // placing a waypoint adds the default waypoints group layer
        await placeWaypoint(page);
        await expect(layersPane.locator('input[type="checkbox"]')).toHaveCount(4);
        await expect(layersPane.getByText('waypoints')).toBeVisible();

        // toggling works
        const gridToggle = layersPane.locator('input[type="checkbox"]').nth(1);
        await expect(gridToggle).toBeChecked();
        await layersPane.locator('.tp-ckbv_w').nth(1).click();
        await expect(gridToggle).not.toBeChecked();
    });
});
