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
        ship.state.warp!.currentLevel = 3;
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
        const firstProgress = await waitForPropertyValue(
            page,
            'progress',
            (v) => parseFloat(v) > 0,
            'Repair Queue',
            5000,
        );
        // a real progression over time, not a restatement of the wait predicate above
        await page.waitForTimeout(500);
        const laterProgress = await getPropertyValue(page, 'progress', 'Repair Queue');
        expect(parseFloat(laterProgress)).toBeGreaterThan(parseFloat(firstProgress));

        const cancelButton = repairQueuePanel.locator('button.tp-btnv_b', { hasText: 'Cancel' });
        await cancelButton.click();

        // terminal status must reach the client and stay visible for a few seconds (R4) — a
        // cancelled repair is not indistinguishable from one that simply vanished
        await waitForPropertyValue(page, 'state', (v) => v === 'CANCELLED', 'Repair Queue', 2000);
        await expect(repairQueuePanel.getByText('state', { exact: true })).not.toBeVisible({ timeout: 5000 });
    });

    test('crew station cannot enqueue a docked-tier protocol', async ({ page }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });
        await expect(
            repairQueuePanel.locator('button.tp-btnv_b', { hasText: 'Hull-wide systems overhaul' }),
        ).toHaveCount(0);
    });

    test('reordering via Move up drives the server-side queue order through the real command path', async ({
        page,
    }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });

        await repairQueuePanel.locator('button.tp-btnv_b', { hasText: 'Actuator recalibration' }).click();
        await repairQueuePanel.locator('button.tp-btnv_b', { hasText: 'Thrust-line purge' }).click();
        await repairQueuePanel.locator('button.tp-btnv_b', { hasText: 'Feed-system overhaul' }).click();

        const ship = gameDriver.getShip(shipId);
        await expect
            .poll(() => ship.state.repairQueue.operations.map((o) => o.protocolId), { timeout: 5000 })
            .toEqual(['actuatorRecalibration', 'thrustLinePurge', 'feedSystemOverhaul']);

        // move the last queued row ("Feed-system overhaul") up, ahead of "Thrust-line purge" —
        // "Actuator recalibration" (index 0) is ACTIVE and has no move buttons at all
        await repairQueuePanel.locator('button.tp-btnv_b', { hasText: 'Move up' }).nth(1).click();

        await expect
            .poll(() => ship.state.repairQueue.operations.map((o) => o.protocolId), { timeout: 5000 })
            .toEqual(['actuatorRecalibration', 'feedSystemOverhaul', 'thrustLinePurge']);
    });

    test('a refused enqueue (queue full) shows a notice instead of silently doing nothing', async ({ page }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });

        const enqueueButton = repairQueuePanel.locator('button.tp-btnv_b', { hasText: 'Sensor-array degauss' });
        for (let i = 0; i < 17; i++) {
            // 16 is the queue cap; the 17th must be refused. dispatchEvent (not click) because the
            // growing queue list pushes this button out of the panel's scrollable viewport as rows
            // accumulate, which a real click requires but the handler itself doesn't care about.
            await enqueueButton.dispatchEvent('click');
        }

        await waitForPropertyValue(page, 'notice', (v) => v !== '', 'Repair Queue', 5000);
    });
});
