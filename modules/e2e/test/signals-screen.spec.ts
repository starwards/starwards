import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';
import { makeDriver, waitForShipCondition } from './driver';

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

    // --- Scan beam controls drive radars[1] (arc / direction) ---
    // The scan beam is the ship's second radar (radars[1]); its Signals-station
    // controls command /radars/1/direction and /radars/1/arc. The `d`/`a` keys
    // step direction (KeysRangeConfig step 5); `w`/`s` step arc.

    test('d key: radars[1].direction increases by one step', async ({ page }) => {
        await expect(page.locator('[data-id="Long Range Radar"]')).toBeVisible({ timeout: 10000 });
        // Ensure the page has received the ship state before pressing keys
        await page.waitForTimeout(500);

        const initial = gameDriver.getShip(shipId).state.radars[1].direction;
        await page.keyboard.press('d');
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.radars[1].direction > initial + 0.01,
            3000,
        );
    });

    test('w key: radars[1].arc increases by one step', async ({ page }) => {
        await expect(page.locator('[data-id="Long Range Radar"]')).toBeVisible({ timeout: 10000 });
        // Ensure the page has received the ship state before pressing keys
        await page.waitForTimeout(500);

        const initial = gameDriver.getShip(shipId).state.radars[1].arc;
        await page.keyboard.press('w');
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.radars[1].arc > initial + 0.01,
            3000,
        );
    });
});
