import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';
import { makeDriver, waitForPropertyFloatValue } from './driver';

import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

test.describe('Helms Screen', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
        await navigateToScreen(page, `/helms.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('displays radar and syncs state correctly', async ({ page }) => {
        // Verify helms radar is visible
        await expect(page.locator('[data-id="Helms Radar"]')).toBeVisible({ timeout: 10000 });

        // Verify warp panel is visible
        await expect(page.locator('[data-id="Warp"]')).toBeVisible();

        // Verify heading state syncs: set known angle and check UI
        const spaceShip = gameDriver.gameManager.spaceManager.state.getShip(shipId);
        if (!spaceShip) throw new Error('ship not found in space');

        spaceShip.angle = 90;
        await waitForPropertyFloatValue(page, 'HDG °', 90, 'Flight', 5);

        // Note: Speed test removed - physics simulation overwrites velocity immediately
        // Heading works because angle is set directly without physics interference
    });

    // The page is fully opaque, so a screenshot with a transparent pixel means the compositor punched a
    // hole: stacked opaque WebGL canvases (armor over radar) used to cut a mirrored 200x200 one into the radar.
    test('armor canvas leaves no hole in the radar beneath it', async ({ page }) => {
        await expect(page.locator('[data-id="Armor"][data-loaded="true"]')).toBeVisible({ timeout: 10000 });
        await page.waitForTimeout(1000);
        const screenshot = (await page.screenshot()).toString('base64');
        const transparentPixels = await page.evaluate(async (b64) => {
            const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
            const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
            if (!ctx) throw new Error('no 2d context');
            ctx.drawImage(bitmap, 0, 0);
            const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
            let count = 0;
            for (let i = 3; i < data.length; i += 4) if (data[i] < 250) count++;
            return count;
        }, screenshot);
        expect(transparentPixels).toBe(0);
    });
});
