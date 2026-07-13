import { expect, test } from '@playwright/test';

import { makeDriver } from './driver';

const gameDriver = makeDriver(test);

test.describe('Weapons widgets', () => {
    test('tube widget exposes a cluster warhead mode toggle', async ({ page }) => {
        await page.goto(`${gameDriver.baseURL}/gallery.html?scene=tubes-status-loaded`);
        const panel = page.locator('[data-id="Tubes Status"]');
        await expect(panel).toBeVisible({ timeout: 10000 });

        const label = panel.getByText('cluster warhead', { exact: true }).first();
        await expect(label).toBeVisible();

        // list blade renders a <select> with the two warhead modes
        const select = label.locator('..').locator('select');
        await expect(select).toBeVisible();
        await expect(select.locator('option')).toHaveText(['Frag', 'ArmPen']);
    });

    test('ammo widget groups shells and missiles', async ({ page }) => {
        await page.goto(`${gameDriver.baseURL}/gallery.html?scene=ammo-full`);
        const panel = page.locator('[data-id="Ammunition"]');
        await expect(panel).toBeVisible({ timeout: 10000 });

        await expect(panel.getByText('Shells', { exact: true })).toBeVisible();
        await expect(panel.getByText('Missiles', { exact: true })).toBeVisible();
    });
});
