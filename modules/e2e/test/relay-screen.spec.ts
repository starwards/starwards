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
        // the hotkey help root is created at the end of input wiring — hotkeys are live after it appears
        await page.locator('#hotkey-help-root').waitFor({ state: 'attached', timeout: 10000 });

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

        // placement mode stays armed for multiple placements — exit it
        await page.keyboard.press('Escape');
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

        // Re-selecting shows the current name in the input
        await page.keyboard.press('Escape');
        const radar = page.locator('[data-id="Relay Radar"]');
        const box = await radar.boundingBox();
        if (!box) throw new Error('Radar canvas not found');
        await page.mouse.click(box.x + 20, box.y + box.height - 20); // empty corner clears selection
        await expect(editPane).toBeHidden();
        await clickRadarCenter(page);
        await expect(editPane).toBeVisible();
        await expect(editPane.locator('input[type="text"]').first()).toHaveValue('Alpha');

        // Delete via the edit pane
        await editPane.getByRole('button', { name: 'Delete' }).click();
        await expect.poll(() => serverWaypoints().length, { timeout: 3000 }).toBe(0);
        await expect(editPane).toBeHidden();
    });

    test('clone creates an offset copy in the waypoint group', async ({ page }) => {
        await placeWaypoint(page);
        await clickRadarCenter(page);
        const editPane = page.locator('[data-id="Edit Waypoint"]');
        await expect(editPane).toBeVisible();

        await editPane.getByRole('button', { name: 'Clone' }).click();

        await expect.poll(() => serverWaypoints().length, { timeout: 3000 }).toBe(2);
        const [original, clone] = serverWaypoints();
        expect(clone.owner).toBe(shipId);
        expect(clone.collection).toBe(original.collection);
        expect(clone.position.x).not.toBe(original.position.x);
    });

    test('drag-and-drop moves a waypoint', async ({ page }) => {
        await placeWaypoint(page);
        const [wp] = serverWaypoints();
        const before = { x: wp.position.x, y: wp.position.y };

        const radar = page.locator('[data-id="Relay Radar"]');
        const box = await radar.boundingBox();
        if (!box) throw new Error('Radar canvas not found');
        const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

        // Drag the waypoint right and down
        await page.mouse.move(center.x, center.y);
        await page.mouse.down();
        await page.mouse.move(center.x + 100, center.y + 60, { steps: 5 });
        await page.mouse.up();

        await expect
            .poll(() => serverWaypoints()[0]?.position.x, { timeout: 3000, message: 'waypoint should move right' })
            .toBeGreaterThan(before.x);
        expect(serverWaypoints()[0]?.position.y).toBeGreaterThan(before.y);
    });

    test('right-button drag pans the camera', async ({ page }) => {
        await placeWaypoint(page);
        await clickRadarCenter(page);
        const editPane = page.locator('[data-id="Edit Waypoint"]');
        await expect(editPane).toBeVisible();

        const radar = page.locator('[data-id="Relay Radar"]');
        const box = await radar.boundingBox();
        if (!box) throw new Error('Radar canvas not found');
        const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

        // Pan the camera with a right-button drag
        await page.mouse.move(center.x, center.y);
        await page.mouse.down({ button: 'right' });
        await page.mouse.move(center.x + 200, center.y, { steps: 5 });
        await page.mouse.up({ button: 'right' });

        // The waypoint is no longer at the screen center — clicking there clears the selection
        await clickRadarCenter(page);
        await expect(editPane).toBeHidden();
    });

    test('placement settings choose the group and color of new waypoints', async ({ page }) => {
        const settingsPane = page.locator('[data-id="New Waypoint"]');
        await expect(settingsPane).toBeVisible({ timeout: 10000 });

        const groupInput = settingsPane.locator('input[type="text"]').first();
        await groupInput.fill('alpha');
        await groupInput.press('Enter');
        const colorInput = settingsPane.locator('.tp-colswv + * input, .tp-txtv_i').nth(1);
        await colorInput.fill('#ff0000');
        await colorInput.press('Enter');
        await colorInput.blur(); // hotkeys are suppressed while a text input has focus

        await placeWaypoint(page);
        await expect.poll(() => serverWaypoints()[0]?.collection, { timeout: 3000 }).toBe('alpha');
        await expect.poll(() => serverWaypoints()[0]?.color, { timeout: 3000 }).toBe(0xff0000);

        // the new group appears as a radar layer toggle
        const layersPane = page.locator('[data-id="Layers"]');
        await expect(layersPane.getByText('waypoints: alpha')).toBeVisible();
    });

    test('placement mode stays armed for multiple waypoints until Escape', async ({ page }) => {
        const radar = page.locator('[data-id="Relay Radar"]');
        await expect(radar).toBeVisible({ timeout: 10000 });
        await page.locator('#hotkey-help-root').waitFor({ state: 'attached', timeout: 10000 });
        const badge = page.locator('[data-id="placement-armed"]');
        await expect(badge).toBeHidden();

        await page.keyboard.press('w');
        await expect(badge).toBeVisible();
        const box = await radar.boundingBox();
        if (!box) throw new Error('Radar canvas not found');
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.click(box.x + box.width / 2 + 80, box.y + box.height / 2);
        await expect.poll(() => serverWaypoints().length, { timeout: 3000 }).toBe(2);

        await page.keyboard.press('Escape');
        await expect(badge).toBeHidden();
        await page.mouse.click(box.x + box.width / 2 - 80, box.y + box.height / 2);
        await page.waitForTimeout(500);
        expect(serverWaypoints().length).toBe(2);
    });

    test('arrow keys pan the camera', async ({ page }) => {
        await placeWaypoint(page);
        await clickRadarCenter(page);
        const editPane = page.locator('[data-id="Edit Waypoint"]');
        await expect(editPane).toBeVisible();

        for (let i = 0; i < 3; i++) {
            await page.keyboard.press('ArrowRight');
        }

        // The waypoint is no longer at the screen center — clicking there clears the selection
        await clickRadarCenter(page);
        await expect(editPane).toBeHidden();

        // panning disengaged ship-follow; F re-engages it and re-centers on the ship
        const radar = page.locator('[data-id="Relay Radar"]');
        await expect(radar).toHaveAttribute('data-following', 'false');
        await page.keyboard.press('f');
        await expect(radar).toHaveAttribute('data-following', 'true');
    });

    test('hiding a waypoint-group layer drops its waypoints from the selection', async ({ page }) => {
        await placeWaypoint(page);
        await clickRadarCenter(page);
        const editPane = page.locator('[data-id="Edit Waypoint"]');
        await expect(editPane).toBeVisible();

        // Uncheck the waypoints group layer (4th toggle: sensor range, grid, objects, waypoints)
        const layersPane = page.locator('[data-id="Layers"]');
        await layersPane.locator('.tp-ckbv_w').nth(3).click();

        // Selection is cleared, closing the edit pane
        await expect(editPane).toBeHidden();
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
