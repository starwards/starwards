import { expect, test } from '@playwright/test';
import { makeDriver } from '../driver';

const gameDriver = makeDriver(test);

const scenes = [
    // Ammo
    'ammo-empty',
    'ammo-full',
    'ammo-low',
    // Armor
    'armor-full-health',
    'armor-light-damage',
    'armor-moderate-damage',
    'armor-heavy-damage',
    'armor-critical',
    'armor-sector-damage',
    // Engineering Status
    'engineering-status-ecr-control',
    'engineering-status-bridge-control',
    'engineering-status-low-energy',
    'engineering-status-full-energy',
    'engineering-status-hull-ok',
    'engineering-status-hull-damaged',
    // GM Radar
    'gm-radar-empty',
    'gm-radar-ships',
    'gm-radar-mixed',
    // Pilot
    'pilot-dashboard-stationary',
    'pilot-dashboard-moving',
    'pilot-dashboard-target-mode',
    // Tactical Radar
    'tactical-radar-empty',
    'tactical-radar-single-ship',
    'tactical-radar-multiple-objects',
    'tactical-radar-with-shells',
    // Long Range Radar
    'long-range-radar-empty',
    'long-range-radar-single-ship',
    'long-range-radar-multiple-objects',
    'long-range-radar-zoomed-in',
    'long-range-radar-zoomed-out',
    // Targeting
    'targeting-no-target',
    'targeting-ship-target',
    'targeting-filters-active',
    // Tubes Status
    'tubes-status-empty',
    'tubes-status-loaded',
    'tubes-status-loading',
    // Warp
    'warp-idle',
    'warp-jammed',
    'warp-calibrating',
    'warp-active',
];

test.describe('Visual Gallery', () => {
    test.describe.configure({ mode: 'parallel' });

    for (const scene of scenes) {
        test(`${scene} renders correctly`, async ({ page }) => {
            await page.goto(`${gameDriver.baseURL}/gallery.html?scene=${scene}`);
            await page.waitForFunction(
                () => (window as unknown as { __PIXI_READY__: boolean }).__PIXI_READY__ === true,
                { timeout: 10000 },
            );
            await page.waitForTimeout(100);
            const container = page.locator('#container');
            await expect(container).toBeVisible();
            const maxDiff = scene.includes('radar') ? 2000 : 200;
            await expect(container).toHaveScreenshot(`${scene}.png`, {
                maxDiffPixels: maxDiff,
                threshold: 0.2,
            });
        });
    }

    test('gallery shows error for unknown scene', async ({ page }) => {
        await page.goto(`${gameDriver.baseURL}/gallery.html?scene=nonexistent-scene`);

        const error = page.locator('#error');
        await expect(error).toBeVisible();
        await expect(error).toContainText('Unknown scene');
    });

    test('gallery auto-redirects to first scene when no scene specified', async ({ page }) => {
        await page.goto(`${gameDriver.baseURL}/gallery.html`);
        await page.waitForURL(/\?scene=ammo-empty/);
        const panel = page.locator('[data-id="Gallery"]');
        await expect(panel).toBeVisible();
    });
});
