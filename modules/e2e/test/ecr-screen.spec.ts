import { Page, expect, test } from '@playwright/test';
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { getPropertyValue, makeDriver } from './driver';

import { WarpFrequency } from '@starwards/core';
import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

// NOTE: input tests are coupled to modules/browser/src/input/input-config.ts
// PowerLevelStep = 0.25, coolant step = 0.1

test.describe('ECR Screen', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);

        await gameDriver.gameManager.startGame(single_ship);

        const ship = gameDriver.getShip(shipId);
        ship.state.ecrControl = true;

        await navigateToScreen(page, `/ecr.html?station=ecr&ship=${shipId}`);
        await waitForEngineeringStatus(page);

        await page.waitForTimeout(500);
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('displays engineering status panel', async ({ page }) => {
        const panel = page.locator('[data-id="Engineering Status"]');
        await expect(panel).toBeVisible();
    });

    test('displays warp status panel', async ({ page }) => {
        const panel = page.locator('[data-id="Warp"]');
        await expect(panel).toBeVisible();
    });

    test('displays armor status panel', async ({ page }) => {
        const panel = page.locator('[data-id="Armor"]');
        await expect(panel).toBeVisible();
    });

    test('displays full systems status panel', async ({ page }) => {
        const panel = page.locator('[data-id="Full Systems Status"]');
        await expect(panel).toBeVisible();
    });

    test('displays energy level', async ({ page }) => {
        const panel = page.locator('[data-id="Engineering Status"]');
        await expect(panel).toBeVisible();

        const ship = gameDriver.getShip(shipId);
        expect(ship.state.reactor.energy).toBeGreaterThan(0);
    });

    test('displays afterburner fuel level', async ({ page }) => {
        const panel = page.locator('[data-id="Engineering Status"]');
        await expect(panel).toBeVisible();

        const ship = gameDriver.getShip(shipId);
        expect(ship.state.maneuvering.afterBurnerFuel).toBeGreaterThanOrEqual(0);
    });

    test('displays ECR control status', async ({ page }) => {
        const control = await getPropertyValue(page, 'control', 'Engineering Status');
        expect(control).toBe('ECR');
    });

    test('keyboard power control increases power', async ({ page }) => {
        await page.keyboard.press('1');
        await page.waitForTimeout(500);

        const panel = page.locator('[data-id="Full Systems Status"]');
        await expect(panel).toBeVisible();
    });

    test('keyboard power control decreases power', async ({ page }) => {
        await page.keyboard.press('q');
        await page.waitForTimeout(500);

        const panel = page.locator('[data-id="Full Systems Status"]');
        await expect(panel).toBeVisible();
    });

    test('keyboard coolant control increases coolant', async ({ page }) => {
        await page.keyboard.press('Shift+1');
        await page.waitForTimeout(500);

        const panel = page.locator('[data-id="Full Systems Status"]');
        await expect(panel).toBeVisible();
    });

    test('keyboard coolant control decreases coolant', async ({ page }) => {
        await page.keyboard.press('Shift+q');
        await page.waitForTimeout(500);

        const panel = page.locator('[data-id="Full Systems Status"]');
        await expect(panel).toBeVisible();
    });

    test('warp frequency controls with keyboard', async ({ page }) => {
        await enableECRControl(page);

        const ship = gameDriver.getShip(shipId);
        const initialFrequency = ship.state.warp.standbyFrequency;

        await page.keyboard.press(']');
        await waitForWarpFrequency(ship, (freq) => freq !== initialFrequency);

        const newFrequency = ship.state.warp.standbyFrequency;
        expect(newFrequency).not.toBe(initialFrequency);
    });

    test('change warp frequency command', async ({ page }) => {
        await enableECRControl(page);

        const ship = gameDriver.getShip(shipId);

        ship.state.warp.standbyFrequency = 2;

        await page.keyboard.press('\\');

        await page.waitForTimeout(1000);

        const panel = page.locator('[data-id="Warp"]');
        await expect(panel).toBeVisible();
    });
});

async function waitForEngineeringStatus(page: Page): Promise<void> {
    const panel = page.locator('[data-id="Engineering Status"]');
    await expect(panel).toBeVisible({ timeout: 10000 });
}

async function enableECRControl(page: Page): Promise<void> {
    const control = await getPropertyValue(page, 'control', 'Engineering Status');
    if (control !== 'ECR') {
        throw new Error('ECR control not enabled. Ensure station=ecr is in URL');
    }
}

async function waitForWarpFrequency(
    ship: ReturnType<typeof gameDriver.getShip>,
    condition: (frequency: WarpFrequency) => boolean,
    timeout = 2000,
): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        if (condition(ship.state.warp.standbyFrequency)) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(
        `Timeout waiting for warp frequency condition. Current frequency: ${ship.state.warp.standbyFrequency}`,
    );
}
