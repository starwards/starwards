import { expect, test } from '@playwright/test';

const scenes = [
    'tactical-radar-empty',
    'tactical-radar-single-ship',
    'tactical-radar-multiple-objects',
    'armor-full-health',
    'armor-light-damage',
    'armor-moderate-damage',
    'armor-heavy-damage',
    'armor-critical',
    'armor-sector-damage',
    'gm-radar-empty',
    'gm-radar-ships',
    'gm-radar-mixed',
];

const GALLERY_BASE_URL = 'http://localhost:3000/gallery.html';

test.describe('Visual Gallery', () => {
    test.describe.configure({ mode: 'parallel' });

    for (const scene of scenes) {
        test(`${scene} renders correctly`, async ({ page }) => {
            await page.goto(`${GALLERY_BASE_URL}?scene=${scene}`);
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
        await page.goto(`${GALLERY_BASE_URL}?scene=nonexistent-scene`);

        const error = page.locator('#error');
        await expect(error).toBeVisible();
        await expect(error).toContainText('Unknown scene');
    });

    test('gallery auto-redirects to first scene when no scene specified', async ({ page }) => {
        await page.goto(GALLERY_BASE_URL);
        await page.waitForURL(/\?scene=armor-critical/);
        const panel = page.locator('[data-id="Gallery"]');
        await expect(panel).toBeVisible();
    });
});
