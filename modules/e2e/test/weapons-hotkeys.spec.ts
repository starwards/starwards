/**
 * Weapons screen keyboard hotkey integration tests.
 *
 * These tests verify that keyboard inputs on the weapons screen produce
 * the expected server-side state changes via the JSON Pointer command
 * surface. Toggle actions (p, o, i, shift+1, g) are the most reliable since
 * their effects persist on the server — momentary commands (x, f, alt+1, b)
 * are harder to observe due to the tight server reset cycle.
 */
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { makeDriver, waitForShipCondition } from './driver';

import { maps } from '@starwards/server';
import { test } from '@playwright/test';

const { single_ship, weapons_multi_tube, weapons_multi_gun, weapons_no_tubes } = maps;
const shipId = single_ship.testShipId;
const twoTubeShipId = weapons_multi_tube.testShipId;
const multiGunShipId = weapons_multi_gun.testShipId;
const noTubesShipId = weapons_no_tubes.testShipId;
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

    // enemyOnly defaults to true (spawn should never present friendlies as targets), so pressing once → false.
    test('o key: weaponsTarget.enemyOnly toggles to false', async ({ page }) => {
        await page.keyboard.press('o');
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.weaponsTarget.enemyOnly === false,
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

    // --- Ammo load toggles (shift+1 for tube 0, g for chainGuns[0]) ---
    // Both start as `true` (loadAmmo = true by default), so press once → false.

    test('shift+1 key: tubes[0].loadAmmo toggles to false', async ({ page }) => {
        await page.keyboard.press('Shift+1');
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

    test('alt+1 key: tubes[0].changeProjectileCommand admitted without whitelist rejection', async ({ page }) => {
        await page.keyboard.press('Alt+1');
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

    // --- Chain gun shell range / time fuse (./, keys — see #2149) ---

    test('. key: chainGuns[0].shellRange increases by one step', async ({ page }) => {
        await page.keyboard.press('.');
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => (ship.state.chainGuns.at(0)?.shellRange ?? 0) > 0.01,
            3000,
        );
    });

    test(', key: chainGuns[0].shellRange decreases by one step', async ({ page }) => {
        await page.keyboard.press(',');
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => (ship.state.chainGuns.at(0)?.shellRange ?? 0) < -0.01,
            3000,
        );
    });
});

test.describe('Weapons hotkeys — multi-tube isolation', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(weapons_multi_tube);
        await navigateToScreen(page, `/weapons.html?ship=${twoTubeShipId}`, { baseURL: gameDriver.baseURL });
        await page.waitForTimeout(500);
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('alt+1 key: changeProjectileCommand cycles only tube 0, tube 1 is unaffected', async ({ page }) => {
        await waitForShipCondition(
            () => gameDriver.getShip(twoTubeShipId),
            (ship) => ship.state.tubes.at(0)?.projectile !== 'None' && ship.state.tubes.at(1)?.projectile !== 'None',
            3000,
        );
        const tube0Before = gameDriver.getShip(twoTubeShipId).state.tubes.at(0)?.projectile;
        const tube1Before = gameDriver.getShip(twoTubeShipId).state.tubes.at(1)?.projectile;

        await page.keyboard.press('Alt+1');

        await waitForShipCondition(
            () => gameDriver.getShip(twoTubeShipId),
            (ship) => ship.state.tubes.at(0)?.projectile !== tube0Before,
            3000,
        );
        await page.waitForTimeout(200);
        const ship = gameDriver.getShip(twoTubeShipId);
        if (ship.state.tubes.at(1)?.projectile !== tube1Before) {
            throw new Error('tube 1 projectile changed after pressing alt+1 (tube 0 only)');
        }
    });

    test('shift+2 key: tubes[1].loadAmmo toggles to false, tube 0 is unaffected', async ({ page }) => {
        const tube0Before = gameDriver.getShip(twoTubeShipId).state.tubes.at(0)?.loadAmmo;

        await page.keyboard.press('Shift+2');

        await waitForShipCondition(
            () => gameDriver.getShip(twoTubeShipId),
            (ship) => ship.state.tubes.at(1)?.loadAmmo === false,
            3000,
        );
        const ship = gameDriver.getShip(twoTubeShipId);
        if (ship.state.tubes.at(0)?.loadAmmo !== tube0Before) {
            throw new Error('tube 0 loadAmmo changed after pressing shift+2 (tube 1 only)');
        }
    });

    test('2 key: tubes[1].safetyLocked toggles to false, tube 0 is unaffected', async ({ page }) => {
        const tube0Before = gameDriver.getShip(twoTubeShipId).state.tubes.at(0)?.safetyLocked;

        await page.keyboard.press('2');

        await waitForShipCondition(
            () => gameDriver.getShip(twoTubeShipId),
            (ship) => ship.state.tubes.at(1)?.safetyLocked === false,
            3000,
        );
        const ship = gameDriver.getShip(twoTubeShipId);
        if (ship.state.tubes.at(0)?.safetyLocked !== tube0Before) {
            throw new Error('tube 0 safetyLocked changed after pressing 2 (tube 1 only)');
        }
    });
});

test.describe('Weapons hotkeys — multi-gun fan-out', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(weapons_multi_gun);
        await navigateToScreen(page, `/weapons.html?ship=${multiGunShipId}`, { baseURL: gameDriver.baseURL });
        await page.waitForTimeout(500);
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('. key: shellRange increases on every chain-gun mount, not just mount 0', async ({ page }) => {
        await page.keyboard.press('.');
        await waitForShipCondition(
            () => gameDriver.getShip(multiGunShipId),
            (ship) =>
                (ship.state.chainGuns.at(0)?.shellRange ?? 0) > 0.01 &&
                (ship.state.chainGuns.at(1)?.shellRange ?? 0) > 0.01 &&
                (ship.state.chainGuns.at(2)?.shellRange ?? 0) > 0.01,
            3000,
        );
    });
});

test.describe('Weapons hotkeys — zero-tube hull', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(weapons_no_tubes);
        await navigateToScreen(page, `/weapons.html?ship=${noTubesShipId}`, { baseURL: gameDriver.baseURL });
        await page.waitForTimeout(500);
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('wireInput does not throw and the screen stays fully functional', async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));

        // a hull with no tubes must not crash wireInput() — other bindings still work
        await page.keyboard.press('p');
        await waitForShipCondition(
            () => gameDriver.getShip(noTubesShipId),
            (ship) => ship.state.weaponsTarget.shipOnly === true,
            3000,
        );

        if (pageErrors.length > 0) {
            throw new Error(`weapons screen threw on a zero-tube hull: ${pageErrors.join(', ')}`);
        }
    });
});
