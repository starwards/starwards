import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';
import { expectNonInteractiveBar, getPropertyValue, makeDriver, waitForPropertyValue } from './driver';

import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

test.describe('ECR Screen', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);

        await gameDriver.gameManager.startGame(single_ship);

        const ship = gameDriver.getShip(shipId);
        ship.state.ecrControl = true;

        await navigateToScreen(page, `/ecr.html?station=ecr&ship=${shipId}`, { baseURL: gameDriver.baseURL });
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('displays all panels and syncs state correctly', async ({ page }) => {
        // Verify all expected panels are visible
        await expect(page.locator('[data-id="Engineering Status"]')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('[data-id="Warp"]')).toBeVisible();
        await expect(page.locator('[data-id="Armor"]')).toBeVisible();
        await expect(page.locator('[data-id="Full Systems Status"]')).toBeVisible();

        // Verify ECR control state is synced
        const control = await getPropertyValue(page, 'control', 'Engineering Status');
        expect(control).toBe('ECR');

        // Verify warp state syncs: set known value and check UI
        // Note: Energy uses addGraph() which has no input element, so we test warp level instead
        const ship = gameDriver.getShip(shipId);
        ship.state.warp.currentLevel = 3;
        await waitForPropertyValue(page, 'Actual LVL', (v) => Math.abs(parseFloat(v) - 3) < 0.5, 'Warp');
    });

    test('coolant and defectible readouts render as non-interactive bars, not draggable sliders', async ({ page }) => {
        const fullStatusPanel = page.locator('[data-id="Full Systems Status"]');
        await expect(fullStatusPanel).toBeVisible({ timeout: 10000 });
        await expectNonInteractiveBar(fullStatusPanel.locator('.sw-bar').first());
    });

    test('warp level readouts render as non-interactive bars, not draggable sliders', async ({ page }) => {
        const warpPanel = page.locator('[data-id="Warp"]');
        await expect(warpPanel).toBeVisible({ timeout: 10000 });
        await expectNonInteractiveBar(warpPanel.locator('.sw-bar').first());
    });

    test('damage report shows a defect, and enqueueing/cancelling a repair drives the queue', async ({ page }) => {
        const ship = gameDriver.getShip(shipId);
        ship.state.radars[0].malfunctionRangeFactor = 0.5;

        const damageReportPanel = page.locator('[data-id="Damage Report"]');
        await expect(damageReportPanel).toBeVisible({ timeout: 10000 });
        await expect(damageReportPanel).toContainText('range fluctuation');

        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible();
        const enqueueButton = repairQueuePanel.locator('button.tp-btnv_b', { hasText: 'Sensor-array degauss' });
        await enqueueButton.click();

        await waitForPropertyValue(page, 'state', (v) => v === 'ACTIVE', 'Repair Queue', 5000);
        const progress = await waitForPropertyValue(page, 'progress', (v) => parseFloat(v) > 0, 'Repair Queue', 5000);
        expect(parseFloat(progress)).toBeGreaterThan(0);

        const cancelButton = repairQueuePanel.locator('button.tp-btnv_b', { hasText: 'Cancel' });
        await cancelButton.click();
        await expect(repairQueuePanel.getByText('state', { exact: true })).not.toBeVisible({ timeout: 5000 });
    });

    test('crew station cannot enqueue a docked-tier protocol', async ({ page }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });
        await expect(
            repairQueuePanel.locator('button.tp-btnv_b', { hasText: 'Hull-wide systems overhaul' }),
        ).toHaveCount(0);
    });
});
