/**
 * Weapons screen keyboard hotkey integration tests.
 *
 * These tests verify that keyboard inputs on the weapons screen produce
 * the expected server-side state changes via the JSON Pointer command
 * surface. Toggle actions (p, o, i, c, g) are the most reliable since
 * their effects persist on the server — momentary commands (x, f, v, b)
 * are harder to observe due to the tight server reset cycle.
 */
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { makeDriver, waitForShipCondition } from './driver';

import { maps } from '@starwards/server';
import { test } from '@playwright/test';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

test.describe('Weapons hotkeys', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
        await navigateToScreen(page, `/weapons.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
        await page.waitForTimeout(500);
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    // --- Targeting filter toggles (p, o, i) ---

    test('p key: weaponsTarget.shipOnly toggles to true', async ({ page }) => {
        await page.keyboard.press('p');
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.weaponsTarget.shipOnly === true,
            3000,
        );
    });

    test('o key: weaponsTarget.enemyOnly toggles to true', async ({ page }) => {
        await page.keyboard.press('o');
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.weaponsTarget.enemyOnly === true,
            3000,
        );
    });

    test('i key: weaponsTarget.shortRangeOnly toggles to true', async ({ page }) => {
        await page.keyboard.press('i');
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.weaponsTarget.shortRangeOnly === true,
            3000,
        );
    });

    // --- Ammo load toggles (c for tube, g for chainGun) ---
    // Both start as `true` (loadAmmo = true by default), so press once → false.

    test('c key: tubes[0].loadAmmo toggles to false', async ({ page }) => {
        await page.keyboard.press('c');
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => {
                const tube = ship.state.tubes.at(0);
                return tube != null && tube.loadAmmo === false;
            },
            3000,
        );
    });

    test('g key: chainGun.loadAmmo toggles to false', async ({ page }) => {
        await page.keyboard.press('g');
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.chainGun?.loadAmmo === false,
            3000,
        );
    });

    // --- Momentary commands — whitelist admission checks ---
    // For these we only verify no whitelist rejection (no throw). The server
    // processes and immediately resets the command field; the transient window
    // is too short to observe reliably in E2E.

    test('] key: weaponsTarget.nextTargetCommand admitted without whitelist rejection', async ({ page }) => {
        await page.keyboard.press(']');
        await page.waitForTimeout(200);
    });

    test('[ key: weaponsTarget.prevTargetCommand admitted without whitelist rejection', async ({ page }) => {
        await page.keyboard.press('[');
        await page.waitForTimeout(200);
    });

    test("' key: weaponsTarget.clearTargetCommand admitted without whitelist rejection", async ({ page }) => {
        await page.keyboard.press("'");
        await page.waitForTimeout(200);
    });

    test('x key: tubes[0].isFiring admitted without whitelist rejection', async ({ page }) => {
        await page.keyboard.press('x');
        await page.waitForTimeout(200);
    });

    test('v key: tubes[0].changeProjectileCommand admitted without whitelist rejection', async ({ page }) => {
        await page.keyboard.press('v');
        await page.waitForTimeout(200);
    });

    test('f key: chainGun.isFiring admitted without whitelist rejection', async ({ page }) => {
        await page.keyboard.press('f');
        await page.waitForTimeout(200);
    });

    test('b key: chainGun.changeProjectileCommand admitted without whitelist rejection', async ({ page }) => {
        await page.keyboard.press('b');
        await page.waitForTimeout(200);
    });
});
