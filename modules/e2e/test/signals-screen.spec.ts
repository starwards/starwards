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

    test('systems status panel lists the radar systems', async ({ page }) => {
        const statusPanel = page.locator('[data-id="Systems Status"]');
        await expect(statusPanel).toBeVisible({ timeout: 10000 });
        // one row per radar system (the ship carries an omni radar and a scan beam)
        await expect(statusPanel.getByText('Radar')).toHaveCount(2);
    });

    // --- Scan beam controls drive radars[1] (arc / direction) ---
    // The scan beam is the ship's second radar (radars[1]); its Signals-station
    // controls command /radars/1/direction and /radars/1/arc. The `d`/`a` keys
    // sweep direction all the way around (KeysRangeConfig step 5); `w` narrows the
    // beam and `s` widens it.

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

    test('a key: radars[1].direction sweeps past the end of its range and around', async ({ page }) => {
        await expect(page.locator('[data-id="Long Range Radar"]')).toBeVisible({ timeout: 10000 });
        // Ensure the page has received the ship state before pressing keys
        await page.waitForTimeout(500);

        // 40 steps of 5 degrees each takes the bearing 200 degrees anticlockwise from 0: past the
        // -180 end of the range, coming back around to +160. A range that stopped at its end would
        // be stuck at -180.
        for (let i = 0; i < 40; i++) {
            await page.keyboard.press('a');
        }
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => Math.abs(ship.state.radars[1].direction - 160) < 1,
            3000,
        );
    });

    test('w key: radars[1].arc narrows by one step', async ({ page }) => {
        await expect(page.locator('[data-id="Long Range Radar"]')).toBeVisible({ timeout: 10000 });
        // Ensure the page has received the ship state before pressing keys
        await page.waitForTimeout(500);

        const initial = gameDriver.getShip(shipId).state.radars[1].arc;
        await page.keyboard.press('w');
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.radars[1].arc < initial - 0.01,
            3000,
        );
    });
});
