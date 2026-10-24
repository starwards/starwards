import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';
import { expectNonInteractiveBar, makeDriver, waitForPropertyValue } from './driver';

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

    test('the magazine panel groups shells and missiles', async ({ page }) => {
        const ammoPanel = page.locator('[data-id="Magazine"]');
        await expect(ammoPanel).toBeVisible({ timeout: 10000 });
        await expect(ammoPanel.getByText('Shells 30mm', { exact: true })).toBeVisible();
        await expect(ammoPanel.getByText('Missiles', { exact: true })).toBeVisible();
    });

    test('a depleted magazine row reads LOW, then EMPTY, in its value and colour', async ({ page }) => {
        const ammoPanel = page.locator('[data-id="Magazine"]');
        await expect(ammoPanel).toBeVisible({ timeout: 10000 });
        const ship = gameDriver.getShip(shipId);
        const designMax = ship.state.magazine.design.max_HiExpMissile;
        expect(designMax).toBeGreaterThan(0);
        const row = ammoPanel.locator('.sw-ammo-row');
        const values = () => row.locator('input').evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));

        ship.state.magazine.setCount('HiExpMissile', Math.max(1, Math.floor(designMax / 4)));
        await expect
            .poll(values, { timeout: 5000 })
            .toContain(`LOW ${Math.max(1, Math.floor(designMax / 4))}/${designMax}`);
        await expect(ammoPanel.locator('.sw-ammo-row[data-status="WARN"]')).toHaveCount(1);

        ship.state.magazine.setCount('HiExpMissile', 0);
        await expect.poll(values, { timeout: 5000 }).toContain('EMPTY');
        await expect(ammoPanel.locator('.sw-ammo-row[data-status="ERROR"]')).toHaveCount(1);
        await expect(ammoPanel.locator('.sw-ammo-row[data-status="WARN"]')).toHaveCount(0);
    });

    test('the magazine panel shows a restocking line only while docked with room to fill, and hides it on undock', async ({
        page,
    }) => {
        const ammoPanel = page.locator('[data-id="Magazine"]');
        await expect(ammoPanel).toBeVisible({ timeout: 10000 });

        // before docking: the ammo panel exists but the restock line is hidden
        const statusLabel = ammoPanel.getByText('Restock', { exact: true });
        await expect(statusLabel).toBeHidden();

        const ship = gameDriver.getShip(shipId);
        ship.state.magazine.setCount('HiExpMissile', 0);
        ship.state.docking.mode = DockingMode.DOCKED;

        await waitForPropertyValue(page, 'Restock', (v) => v === 'RESTOCKING', 'Magazine', 5000);
        const statusRow = statusLabel.locator('..');
        await expect(statusRow).toHaveAttribute('data-status', 'OK');

        ship.state.docking.mode = DockingMode.UNDOCKED;

        await expect(statusLabel).toBeHidden({ timeout: 5000 });
        await expect(statusRow).not.toHaveAttribute('data-status', 'OK');
    });
});
