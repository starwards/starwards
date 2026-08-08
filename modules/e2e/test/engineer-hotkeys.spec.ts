/**
 * Engineer screen keyboard hotkey integration tests.
 *
 * Covers the warp-console keys: brackets (warp standbyFrequency step) and
 * backslash (changeFrequency).
 *
 * System power/coolant keys (1-0, q-p, shift variants) are assigned
 * dynamically per system index and are skipped — their state is already
 * covered by the `@tweakable` implicit admission and the engineer screen test.
 */
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { makeDriver, waitForShipCondition } from './driver';

import { maps } from '@starwards/server';
import { test } from '@playwright/test';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

test.describe('Engineer hotkeys', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
        await navigateToScreen(page, `/engineer.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
        await page.waitForTimeout(500);
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    // ] key steps warp standbyFrequency up by 1.
    test('] key: warp standbyFrequency increases', async ({ page }) => {
        const initial = gameDriver.getShip(shipId).state.warp!.standbyFrequency;
        await page.keyboard.press(']');
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.warp!.standbyFrequency > initial,
            3000,
        );
    });

    // [ key steps warp standbyFrequency down. First set it to a non-zero value
    // so there's room to decrease.
    test('[ key: warp standbyFrequency decreases', async ({ page }) => {
        // Preposition at a value where there's room to decrease.
        // standbyFrequency is a WarpFrequency enum; use Number() to compare.
        gameDriver.getShip(shipId).state.warp!.standbyFrequency = 2;
        await page.waitForTimeout(100);
        await page.keyboard.press('[');
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => Number(ship.state.warp!.standbyFrequency) < 2,
            3000,
        );
    });

    // \ key fires warp changeFrequencyCommand (momentary — verify no whitelist rejection).
    test('\\ key: warp changeFrequencyCommand admitted without whitelist rejection', async ({ page }) => {
        await page.keyboard.press('\\');
        await page.waitForTimeout(200);
    });
});
