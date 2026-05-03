import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';
import { makeDriver } from './driver';

import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

test.describe('Signals Screen', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
        await navigateToScreen(page, `/signals.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('displays long range radar', async ({ page }) => {
        await expect(page.locator('[data-id="Long Range Radar"]')).toBeVisible({ timeout: 10000 });
    });

    test('places waypoint when W is pressed and radar is clicked', async ({ page }) => {
        const radar = page.locator('[data-id="Long Range Radar"]');
        await expect(radar).toBeVisible({ timeout: 10000 });

        // Press W to enter waypoint placement mode
        await page.keyboard.press('w');

        // Click the center of the radar
        const box = await radar.boundingBox();
        if (!box) throw new Error('Radar canvas not found');
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

        // Wait for waypoint to appear in server space state
        await expect
            .poll(() => [...gameDriver.gameManager.spaceManager.state.getAll('Waypoint')].length, {
                timeout: 3000,
                message: 'expected at least one waypoint to be created',
            })
            .toBeGreaterThan(0);
    });
});
