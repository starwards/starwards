import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';

import { makeDriver } from './driver';
import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

// No shipped hull actually omits a warp drive (demo-ship always has one), so these
// tests simulate ShipDesign.warp: null (issue #2032) by nulling the field on an already
// running ship, before the client connects - exercising the exact `state.warp === null`
// path the ECR/Pilot screens must survive.
test.describe('Warpless ship screens', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
        gameDriver.getShip(shipId).state.warp = null;
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('ECR screen renders every other panel when the ship has no warp drive', async ({ page }) => {
        gameDriver.getShip(shipId).state.ecrControl = true;
        await navigateToScreen(page, `/ecr.html?station=ecr&ship=${shipId}`, { baseURL: gameDriver.baseURL });

        await expect(page.locator('[data-id="Engineering Status"]')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('[data-id="Full Systems Status"]')).toBeVisible();
        await expect(page.locator('[data-id="Armor"]')).toBeVisible();
        await expect(page.locator('[data-id="Warp"]')).toHaveCount(0);
    });

    test('Pilot screen renders every other panel when the ship has no warp drive', async ({ page }) => {
        await navigateToScreen(page, `/pilot.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });

        await expect(page.locator('[data-id="Pilot Radar"]')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('[data-id="Docking"]')).toBeVisible();
        await expect(page.locator('[data-id="Armor"]')).toBeVisible();
        await expect(page.locator('[data-id="Warp"]')).toHaveCount(0);
    });
});
