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

const { single_ship, weapons_multi_tube } = maps;
const shipId = single_ship.testShipId;
const twoTubeShipId = weapons_multi_tube.testShipId;
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

    // --- Ammo load toggles (c for tube, g for chainGuns[0]) ---
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

    test('g key: chainGuns[0].loadAmmo toggles to false', async ({ page }) => {
        await page.keyboard.press('g');
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.chainGuns.at(0)?.loadAmmo === false,
            3000,
        );
    });

    // --- Per-tube safety toggle (dedicated hotkey per tube index) ---
    // Tubes spawn with their safety locked, so pressing tube 0's dedicated key unlocks it.

    test('1 key: tubes[0].safetyLocked toggles to false', async ({ page }) => {
        await page.keyboard.press('1');
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => {
                const tube = ship.state.tubes.at(0);
                return tube != null && tube.safetyLocked === false;
            },
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

    test('x key: fireTubesCommand admitted without whitelist rejection', async ({ page }) => {
        await page.keyboard.press('x');
        await page.waitForTimeout(200);
    });

    test('v key: tubes[0].changeProjectileCommand admitted without whitelist rejection', async ({ page }) => {
        await page.keyboard.press('v');
        await page.waitForTimeout(200);
    });

    test('f key: every chainGuns[*].isFiring admitted without whitelist rejection', async ({ page }) => {
        await page.keyboard.press('f');
        await page.waitForTimeout(200);
    });

    test('b key: chainGuns[0].changeProjectileCommand admitted without whitelist rejection', async ({ page }) => {
        await page.keyboard.press('b');
        await page.waitForTimeout(200);
    });
});

test.describe('Weapons hotkeys — multi-tube fan-out', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(weapons_multi_tube);
        await navigateToScreen(page, `/weapons.html?ship=${twoTubeShipId}`, { baseURL: gameDriver.baseURL });
        await page.waitForTimeout(500);
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('v key: changeProjectileCommand cycles ammo on every tube, not just tube 0', async ({ page }) => {
        await waitForShipCondition(
            () => gameDriver.getShip(twoTubeShipId),
            (ship) => ship.state.tubes.at(0)?.projectile !== 'None' && ship.state.tubes.at(1)?.projectile !== 'None',
            3000,
        );
        const before = gameDriver.getShip(twoTubeShipId).state.tubes.at(1)?.projectile;

        await page.keyboard.press('v');

        await waitForShipCondition(
            () => gameDriver.getShip(twoTubeShipId),
            (ship) => ship.state.tubes.at(1)?.projectile !== before,
            3000,
        );
    });

    // gravitas spawns with 2 tubes; c fans out to all of them instead of only tube 0.
    test('c key: every tube.loadAmmo toggles to false, not just tube 0', async ({ page }) => {
        await page.keyboard.press('c');
        await waitForShipCondition(
            () => gameDriver.getShip(twoTubeShipId),
            (ship) => ship.state.tubes.length >= 2 && ship.state.tubes.every((tube) => tube.loadAmmo === false),
            3000,
        );
    });
});
