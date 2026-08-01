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
    'long-range-radar-scan-beam',
    'long-range-radar-job-indicators',
    // Targeting
    'targeting-no-target',
    'targeting-ship-target',
    'targeting-filters-active',
    // Tubes Status
    'tubes-status-empty',
    'tubes-status-loaded',
    'tubes-status-loading',
    'tubes-status-cluster',
    // Warp
    'warp-idle',
    'warp-jammed',
    'warp-calibrating',
    'warp-active',
];

// Set by scripts/check-gallery-sensitivity.mjs to displace every scene's rendering, proving these
// assertions can fail. Unset in a normal run.
const perturb = process.env.GALLERY_PERTURB;

// The gallery renders deterministically: two consecutive runs of all 43 scenes differ by zero pixels
// at threshold 0, so a scene may not differ from its baseline at all. The small threshold only
// absorbs sub-perceptual colour drift between machines; it is far below the delta of real text and
// artwork against these dark backgrounds, which the previous 0.2 discarded wholesale.
const snapshotTolerance = { maxDiffPixels: 0, threshold: 0.05 };

test.describe('Visual Gallery', () => {
    test.describe.configure({ mode: 'parallel' });

    for (const scene of scenes) {
        test(`${scene} renders correctly`, async ({ page }) => {
            const perturbation = perturb ? `&perturb=${perturb}` : '';
            await page.goto(`${gameDriver.baseURL}/gallery.html?scene=${scene}${perturbation}`);
            await page.waitForFunction(
                () => (window as unknown as { __PIXI_READY__: boolean }).__PIXI_READY__ === true,
                { timeout: 10000 },
            );
            await page.waitForTimeout(100);
            const container = page.locator('#container');
            await expect(container).toBeVisible();
            await expect(container).toHaveScreenshot(`${scene}.png`, snapshotTolerance);
        });
    }

    test('gallery shows error for unknown scene', async ({ page }) => {
        await page.goto(`${gameDriver.baseURL}/gallery.html?scene=nonexistent-scene`);

        const error = page.locator('#error');
        await expect(error).toBeVisible();
        await expect(error).toContainText('Unknown scene');
    });

    test('gallery unknown-scene error lists available scenes', async ({ page }) => {
        await page.goto(`${gameDriver.baseURL}/gallery.html?scene=nonexistent-scene`);

        const error = page.locator('#error');
        await expect(error).toBeVisible();
        await expect(error).toContainText('ammo-empty');
        await expect(error).toContainText('warp-active');
    });

    test('gallery auto-redirects to first scene when no scene specified', async ({ page }) => {
        await page.goto(`${gameDriver.baseURL}/gallery.html`);
        await page.waitForURL(/\?scene=ammo-empty/);
        const panel = page.locator('[data-id="Gallery"]');
        await expect(panel).toBeVisible();
    });

    test('page title reflects the loaded scene', async ({ page }) => {
        await page.goto(`${gameDriver.baseURL}/gallery.html?scene=pilot-dashboard-stationary`);
        await expect(page).toHaveTitle('pilot-dashboard-stationary — Starwards Gallery');
    });

    test('page title stays static for an unknown scene', async ({ page }) => {
        await page.goto(`${gameDriver.baseURL}/gallery.html?scene=nonexistent-scene`);
        await expect(page).toHaveTitle('Starwards Visual Gallery');
    });
});
