import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';
import {
    expectNonInteractiveBar,
    getPropertyValue,
    makeDriver,
    waitForPropertyValue,
    waitForShipCondition,
} from './driver';

import { DockingMode } from '@starwards/core';
import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

test.describe('Weapons Screen', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
        await navigateToScreen(page, `/weapons.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('displays all panels and syncs state correctly', async ({ page }) => {
        // Verify all expected panels are visible
        await expect(page.locator('[data-id="Tactical Radar"]')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('[data-id="Tubes"]')).toBeVisible();
        await expect(page.locator('[data-id="Target"]')).toBeVisible();
        await expect(page.locator('[data-id="Magazine"]')).toBeVisible();
        await expect(page.locator('[data-id="Chain Gun"]')).toBeVisible();

        // each tube is a sub-header with its ammo readout under it
        const tubes = page.locator('[data-id="Tubes"]');
        await expect(tubes.getByText(/^T0 · /)).toBeVisible();
        await expect(tubes.locator('.sw-mode input').first()).not.toHaveValue('');
        await expect(page.locator('[data-id="Target"] .sw-big input')).toHaveValue('—');
    });

    test('a tube with its safety locked lights the SAFE annunciator amber', async ({ page }) => {
        const safe = page.locator('[data-id="Tubes"] .sw-ann[data-tone="caution"]').first();
        await expect(safe).toBeVisible({ timeout: 10000 });
        await expect(safe.getByText('Safe', { exact: true })).toBeVisible();
        await expect(safe.locator('.tp-ckbv_i')).toHaveAttribute('data-checked', 'true');
        expect(await safe.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 176, 0)');
    });

    test('tube and chain gun loading readouts render as non-interactive bars, not draggable sliders', async ({
        page,
    }) => {
        const tubesPanel = page.locator('[data-id="Tubes"]');
        await expect(tubesPanel).toBeVisible({ timeout: 10000 });
        await expectNonInteractiveBar(tubesPanel.locator('.sw-bar').first());

        const gunPanel = page.locator('[data-id="Chain Gun"]');
        await expect(gunPanel).toBeVisible();
        await expectNonInteractiveBar(gunPanel.locator('.sw-bar').first());
    });

    test('picking a warhead mode on a tube sets it on the ship state', async ({ page }) => {
        const tubesPanel = page.locator('[data-id="Tubes"]');
        await expect(tubesPanel).toBeVisible({ timeout: 10000 });

        const modeLabel = tubesPanel.getByText('Warhead', { exact: true }).first();
        await expect(modeLabel).toBeVisible();
        await modeLabel.locator('..').locator('select').selectOption('ArmPen');

        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.tubes.at(0)?.clusterWarhead === 'ArmPen',
            3000,
        );
    });

    test('the magazine panel groups shells and missiles', async ({ page }) => {
        const ammoPanel = page.locator('[data-id="Magazine"]');
        await expect(ammoPanel).toBeVisible({ timeout: 10000 });
        await expect(ammoPanel.getByText('Shells 30mm', { exact: true })).toBeVisible();
        await expect(ammoPanel.getByText('Missiles', { exact: true })).toBeVisible();
    });

    test('the magazine panel shows a restocking indicator while docked with room to fill, and clears it on undock', async ({
        page,
    }) => {
        const ammoPanel = page.locator('[data-id="Magazine"]');
        await expect(ammoPanel).toBeVisible({ timeout: 10000 });

        // idle before docking: the ammo panel exists but carries no active-restock marker
        expect(await getPropertyValue(page, 'Restock', 'Magazine')).toBe('IDLE');

        const ship = gameDriver.getShip(shipId);
        ship.state.magazine.setCount('HiExpMissile', 0);
        ship.state.docking.mode = DockingMode.DOCKED;

        await waitForPropertyValue(page, 'Restock', (v) => v === 'RESTOCKING', 'Magazine', 5000);
        const statusLabel = ammoPanel.getByText('Restock', { exact: true });
        const statusRow = statusLabel.locator('..');
        await expect(statusRow).toHaveAttribute('data-status', 'OK');

        ship.state.docking.mode = DockingMode.UNDOCKED;

        await waitForPropertyValue(page, 'Restock', (v) => v === 'IDLE', 'Magazine', 5000);
        await expect(statusRow).not.toHaveAttribute('data-status', 'OK');
    });
});
