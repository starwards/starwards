import { Page, expect, test } from '@playwright/test';
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { makeDriver, waitForShipCondition } from './driver';

import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

async function waitForRadarReady(page: Page) {
    await expect(page.locator('[data-id="Long Range Radar"]')).toBeVisible({ timeout: 10000 });
    // Ensure the page has received the ship state before pressing keys
    await page.waitForTimeout(500);
}

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
    // controls command /radars/1/directionCommand and /radars/1/arc. The `d`/`a` keys
    // sweep the commanded bearing all the way around (KeysRangeConfig step 5), and the
    // mount swings toward it at its turn speed; `w` narrows the beam and `s` widens it.

    test('d key: the mount swings toward the commanded bearing', async ({ page }) => {
        await waitForRadarReady(page);

        const initial = gameDriver.getShip(shipId).state.radars[1].direction;
        await page.keyboard.press('d');
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.radars[1].direction > initial + 0.01,
            3000,
        );
    });

    test('a key: the commanded bearing sweeps past the end of its range and around', async ({ page }) => {
        await waitForRadarReady(page);

        // 40 steps of 5 degrees each takes the bearing 200 degrees anticlockwise from 0: past the
        // -180 end of the range, coming back around to +160. A range that stopped at its end would
        // be stuck at -180.
        for (let i = 0; i < 40; i++) {
            await page.keyboard.press('a');
        }
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => Math.abs(ship.state.radars[1].directionCommand - 160) < 1,
            3000,
        );
    });

    test('w key: radars[1].arc narrows by one step', async ({ page }) => {
        await waitForRadarReady(page);

        const initial = gameDriver.getShip(shipId).state.radars[1].arc;
        await page.keyboard.press('w');
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.radars[1].arc < initial - 0.01,
            3000,
        );
    });

    // --- Signals Jobs panel: the station's view of the top of the job queue ---

    test('signals jobs panel shows the auto-created scan job for a new contact', async ({ page }) => {
        const panel = page.locator('[data-id="Signals Jobs"]');
        await expect(panel).toBeVisible({ timeout: 10000 });

        // a fresh contact in radar range gets an auto scan job, surfaced as the top of the queue
        // (created via the server's own command queue — a test-constructed schema instance would
        // fail colyseus' class-identity assertion)
        gameDriver.gameManager.spaceManager.state.createAsteroidCommands.push({
            position: { x: 1000, y: 0 },
            radius: 50,
        });
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.signals.jobs.length > 0,
            5000,
        );
        const [rock] = gameDriver.gameManager.spaceManager.state.getAll('Asteroid');
        await expect(panel.getByText(`SCAN ${rock.id}`)).toBeVisible({ timeout: 10000 });
        await expect(panel.getByText('progress')).toBeVisible();
    });

    test('paused toggle halts all jobs via /signals/jobsPaused', async ({ page }) => {
        const panel = page.locator('[data-id="Signals Jobs"]');
        await expect(panel).toBeVisible({ timeout: 10000 });

        expect(gameDriver.getShip(shipId).state.signals.jobsPaused).toBe(false);
        // the tweakpane checkbox input itself is invisible; click its styled wrapper
        await panel.locator('.tp-ckbv_w').click();
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.signals.jobsPaused,
            3000,
        );
    });
});
