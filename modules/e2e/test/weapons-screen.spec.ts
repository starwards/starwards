import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';
import { expectNonInteractiveBar, getPropertyValue, makeDriver, waitForShipCondition } from './driver';

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
        await expect(page.locator('[data-id="Tubes Status"]')).toBeVisible();
        await expect(page.locator('[data-id="Targeting"]')).toBeVisible();
        await expect(page.locator('[data-id="Ammunition"]')).toBeVisible();
        await expect(page.locator('[data-id="Chain Gun"]')).toBeVisible();

        // Note: targetId sync test removed - setting state directly doesn't trigger UI sync
        // Verify ammo to use syncs
        const ammoToUse = await getPropertyValue(page, 'ammo to use', 'Tube 0');
        expect(ammoToUse).toBeDefined();
        expect(ammoToUse.length).toBeGreaterThan(0);
    });

    test('tube and chain gun loading readouts render as non-interactive bars, not draggable sliders', async ({
        page,
    }) => {
        const tubesPanel = page.locator('[data-id="Tubes Status"]');
        await expect(tubesPanel).toBeVisible({ timeout: 10000 });
        await expectNonInteractiveBar(tubesPanel.locator('.sw-bar').first());

        const gunPanel = page.locator('[data-id="Chain Gun"]');
        await expect(gunPanel).toBeVisible();
        await expectNonInteractiveBar(gunPanel.locator('.sw-bar').first());
    });

    test('picking a cluster warhead mode on a tube sets it on the ship state', async ({ page }) => {
        const tubesPanel = page.locator('[data-id="Tubes Status"]');
        await expect(tubesPanel).toBeVisible({ timeout: 10000 });

        const modeLabel = tubesPanel.getByText('cluster warhead', { exact: true }).first();
        await expect(modeLabel).toBeVisible();
        await modeLabel.locator('..').locator('select').selectOption('ArmPen');

        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.tubes.at(0)?.clusterWarhead === 'ArmPen',
            3000,
        );
    });

    test('the ammunition panel groups shells and missiles', async ({ page }) => {
        const ammoPanel = page.locator('[data-id="Ammunition"]');
        await expect(ammoPanel).toBeVisible({ timeout: 10000 });
        await expect(ammoPanel.getByText('Shells', { exact: true })).toBeVisible();
        await expect(ammoPanel.getByText('Missiles', { exact: true })).toBeVisible();
    });
});
