import { Locator, Page, expect, test } from '@playwright/test';
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { getPropertyValue, makeDriver, waitForPropertyValue } from './driver';

import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

// NOTE: input tests are coupled to modules/browser/src/input/input-config.ts

test.describe('Weapons Screen', () => {
    test.beforeEach(async ({ page }) => {
        // Set up error handlers for fail-fast behavior
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
        await navigateToScreen(page, `/weapons.html?ship=${shipId}`);

        try {
            await waitForTacticalRadar(page);
        } catch (error) {
            throw new Error(`Failed to wait for tactical radar. Error: ${String(error)}`);
        }
    });

    test.afterEach(async ({ page }) => {
        // Clean up page state to prevent test failures from cascading
        await cleanupPageState(page);
    });

    test('displays tubes status panel', async ({ page }) => {
        const tubesPanel = page.locator('[data-id="Tubes Status"]');
        await expect(tubesPanel).toBeVisible();
    });

    test('displays tactical radar', async ({ page }) => {
        const radar = await waitForTacticalRadar(page);
        await expect(radar).toBeVisible();
    });

    test('displays targeting panel', async ({ page }) => {
        const targetingPanel = page.locator('[data-id="Targeting"]');
        await expect(targetingPanel).toBeVisible();
    });

    test('displays ammunition panel', async ({ page }) => {
        const ammoPanel = page.locator('[data-id="Ammunition"]');
        await expect(ammoPanel).toBeVisible();
    });

    test('toggle ship only filter with keyboard', async ({ page }) => {
        const initialValue = await getPropertyValue(page, 'Ship Only', 'Targeting');
        const expectedValue = initialValue === 'true' ? 'false' : 'true';

        await page.keyboard.press('p');
        await waitForPropertyValue(page, 'Ship Only', (value) => value === expectedValue, 'Targeting');
    });

    test('toggle enemy only filter with keyboard', async ({ page }) => {
        const initialValue = await getPropertyValue(page, 'Enemy Only', 'Targeting');
        const expectedValue = initialValue === 'true' ? 'false' : 'true';

        await page.keyboard.press('o');
        await waitForPropertyValue(page, 'Enemy Only', (value) => value === expectedValue, 'Targeting');
    });

    test('toggle short range filter with keyboard', async ({ page }) => {
        const initialValue = await getPropertyValue(page, 'Short Range', 'Targeting');
        const expectedValue = initialValue === 'true' ? 'false' : 'true';

        await page.keyboard.press('i');
        await waitForPropertyValue(page, 'Short Range', (value) => value === expectedValue, 'Targeting');
    });

    test('toggle auto load with keyboard', async ({ page }) => {
        const tubesPanel = page.locator('[data-id="Tubes Status"]');
        await expect(tubesPanel).toBeVisible();

        const initialValue = await getPropertyValue(page, 'auto load', 'Tube 0');
        const expectedValue = initialValue === 'true' ? 'false' : 'true';

        await page.keyboard.press('c');
        await waitForPropertyValue(page, 'auto load', (value) => value === expectedValue, 'Tube 0');
    });

    test('displays current ammo to use', async ({ page }) => {
        const ammoToUse = await getPropertyValue(page, 'ammo to use', 'Tube 0');
        expect(ammoToUse).toBeDefined();
        expect(ammoToUse.length).toBeGreaterThan(0);
    });

    test('displays ammo counts', async ({ page }) => {
        const ammoPanel = page.locator('[data-id="Ammunition"]');
        await expect(ammoPanel).toBeVisible();
    });
});

async function waitForTacticalRadar(page: Page): Promise<Locator> {
    const tacticalRadar = page.locator('[data-id="Tactical Radar"]');
    await expect(tacticalRadar).toBeVisible({ timeout: 5000 });
    return tacticalRadar;
}
