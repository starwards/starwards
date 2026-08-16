/**
 * Weapons screen keyboard hotkey integration tests.
 *
 * These tests verify that keyboard inputs on the weapons screen produce
 * the expected server-side state changes via the JSON Pointer command
 * surface. Toggle actions (p, o, i, g, and the per-tube digit chords) are
 * the most reliable since their effects persist on the server — momentary
 * commands (x, f, b, and per-tube Alt+digit) are harder to observe due to
 * the tight server reset cycle.
 *
 * Per-tube actions are addressed by physical digit key + modifier: digit n+1
 * toggles tube n's safety, Shift+digit toggles its load/unload, Alt+digit
 * cycles its ammo. `c` and `v` no longer bind anything — see #2182.
 */
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';
import { makeDriver, waitForShipCondition } from './driver';

import { maps } from '@starwards/server';

const { single_ship, weapons_multi_tube, weapons_multi_gun } = maps;
const shipId = single_ship.testShipId;
const twoTubeShipId = weapons_multi_tube.testShipId;
const multiGunShipId = weapons_multi_gun.testShipId;
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

    // --- Ammo load toggles (Shift+Digit1 for tube 0, g for chainGuns[0]) ---
    // Both start as `true` (loadAmmo = true by default), so press once → false.

    test('Shift+Digit1 key: tubes[0].loadAmmo toggles to false', async ({ page }) => {
        await page.keyboard.press('Shift+Digit1');
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

    test('Alt+Digit1 key: tubes[0].changeProjectileCommand admitted without whitelist rejection', async ({ page }) => {
        await page.keyboard.press('Alt+Digit1');
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

test.describe('Weapons hotkeys — per-tube independence (GVTS-2TUBE)', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(weapons_multi_tube);
        await navigateToScreen(page, `/weapons.html?ship=${twoTubeShipId}`, { baseURL: gameDriver.baseURL });
        await page.waitForTimeout(500);
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    // --- Safety (Digit1 / Digit2) — tubes spawn safetyLocked = true ---

    test('Digit1: tubes[0].safetyLocked toggles to false, tubes[1] unaffected', async ({ page }) => {
        const before1 = gameDriver.getShip(twoTubeShipId).state.tubes.at(1)?.safetyLocked;

        await page.keyboard.press('1');

        await waitForShipCondition(
            () => gameDriver.getShip(twoTubeShipId),
            (ship) => ship.state.tubes.at(0)?.safetyLocked === false,
            3000,
        );
        expect(gameDriver.getShip(twoTubeShipId).state.tubes.at(1)?.safetyLocked).toBe(before1);
    });

    test('Digit2: tubes[1].safetyLocked toggles to false, tubes[0] unaffected', async ({ page }) => {
        const before0 = gameDriver.getShip(twoTubeShipId).state.tubes.at(0)?.safetyLocked;

        await page.keyboard.press('2');

        await waitForShipCondition(
            () => gameDriver.getShip(twoTubeShipId),
            (ship) => ship.state.tubes.at(1)?.safetyLocked === false,
            3000,
        );
        expect(gameDriver.getShip(twoTubeShipId).state.tubes.at(0)?.safetyLocked).toBe(before0);
    });

    // --- Load/unload (Shift+Digit1 / Shift+Digit2) — tubes spawn loadAmmo = true ---

    test('Shift+Digit1: tubes[0].loadAmmo toggles to false, tubes[1] unaffected', async ({ page }) => {
        const before1 = gameDriver.getShip(twoTubeShipId).state.tubes.at(1)?.loadAmmo;

        await page.keyboard.press('Shift+Digit1');

        await waitForShipCondition(
            () => gameDriver.getShip(twoTubeShipId),
            (ship) => ship.state.tubes.at(0)?.loadAmmo === false,
            3000,
        );
        expect(gameDriver.getShip(twoTubeShipId).state.tubes.at(1)?.loadAmmo).toBe(before1);
    });

    test('Shift+Digit2: tubes[1].loadAmmo toggles to false, tubes[0] unaffected', async ({ page }) => {
        const before0 = gameDriver.getShip(twoTubeShipId).state.tubes.at(0)?.loadAmmo;

        await page.keyboard.press('Shift+Digit2');

        await waitForShipCondition(
            () => gameDriver.getShip(twoTubeShipId),
            (ship) => ship.state.tubes.at(1)?.loadAmmo === false,
            3000,
        );
        expect(gameDriver.getShip(twoTubeShipId).state.tubes.at(0)?.loadAmmo).toBe(before0);
    });

    // --- Change ammo (Alt+Digit1 / Alt+Digit2) — cycles that tube's projectile only ---

    test('Alt+Digit1: tubes[0].projectile cycles, tubes[1].projectile unaffected', async ({ page }) => {
        await waitForShipCondition(
            () => gameDriver.getShip(twoTubeShipId),
            (ship) => ship.state.tubes.at(0)?.projectile !== 'None' && ship.state.tubes.at(1)?.projectile !== 'None',
            3000,
        );
        const before0 = gameDriver.getShip(twoTubeShipId).state.tubes.at(0)?.projectile;
        const before1 = gameDriver.getShip(twoTubeShipId).state.tubes.at(1)?.projectile;

        await page.keyboard.press('Alt+Digit1');

        await waitForShipCondition(
            () => gameDriver.getShip(twoTubeShipId),
            (ship) => ship.state.tubes.at(0)?.projectile !== before0,
            3000,
        );
        expect(gameDriver.getShip(twoTubeShipId).state.tubes.at(1)?.projectile).toBe(before1);
    });

    test('Alt+Digit2: tubes[1].projectile cycles, tubes[0].projectile unaffected', async ({ page }) => {
        await waitForShipCondition(
            () => gameDriver.getShip(twoTubeShipId),
            (ship) => ship.state.tubes.at(0)?.projectile !== 'None' && ship.state.tubes.at(1)?.projectile !== 'None',
            3000,
        );
        const before0 = gameDriver.getShip(twoTubeShipId).state.tubes.at(0)?.projectile;
        const before1 = gameDriver.getShip(twoTubeShipId).state.tubes.at(1)?.projectile;

        await page.keyboard.press('Alt+Digit2');

        await waitForShipCondition(
            () => gameDriver.getShip(twoTubeShipId),
            (ship) => ship.state.tubes.at(1)?.projectile !== before1,
            3000,
        );
        expect(gameDriver.getShip(twoTubeShipId).state.tubes.at(0)?.projectile).toBe(before0);
    });

    // --- c and v no longer bind anything on the weapons station ---

    test('c and v keys: no tube state changes (bindings removed)', async ({ page }) => {
        const before = gameDriver.getShip(twoTubeShipId).state.tubes.map((t) => ({
            loadAmmo: t.loadAmmo,
            safetyLocked: t.safetyLocked,
            projectile: t.projectile,
        }));

        await page.keyboard.press('c');
        await page.keyboard.press('v');
        await page.waitForTimeout(300);

        const after = gameDriver.getShip(twoTubeShipId).state.tubes.map((t) => ({
            loadAmmo: t.loadAmmo,
            safetyLocked: t.safetyLocked,
            projectile: t.projectile,
        }));
        expect(after).toEqual(before);
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
