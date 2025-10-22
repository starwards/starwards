import { Locator, Page, expect, test } from '@playwright/test';
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { getPropertyValue, makeDriver, waitForPropertyFloatValue, waitForPropertyValue } from './driver';

import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

// NOTE: input tests are coupled to modules/browser/src/input/input-config.ts

test.describe('Pilot Screen', () => {
    test.beforeEach(async ({ page }) => {
        // Set up error handlers for fail-fast behavior
        setupPageErrorHandlers(page);

        await gameDriver.gameManager.startGame(single_ship);
        await navigateToScreen(page, `/pilot.html?ship=${shipId}`);
        await waitForPilotRadar(page);
    });

    test.afterEach(async ({ page }) => {
        // Clean up page state to prevent test failures from cascading
        await cleanupPageState(page);
    });

    test('displays current ship heading', async ({ page }) => {
        const spaceShip = getSpaceShipObject();
        const initialAngle = spaceShip.angle;

        expect(initialAngle).toBeDefined();
        await waitForPropertyFloatValue(page, 'heading', initialAngle);

        const newAngle = (initialAngle + 45) % 360;
        spaceShip.angle = newAngle;
        await waitForPropertyFloatValue(page, 'heading', newAngle);
    });

    test('keyboard rotation controls update rotation command', async ({ page }) => {
        await page.keyboard.press('e');
        await waitForPropertyFloatValue(page, 'rotationCommand', 0.05);

        await page.keyboard.press('q');
        await waitForPropertyFloatValue(page, 'rotationCommand', -0.05);
    });

    test('displays current speed', async ({ page }) => {
        const ship = gameDriver.getShip(shipId);
        const initialSpeed = ship.state.speed;

        await waitForPropertyFloatValue(page, 'speed', initialSpeed, undefined, 1);
        await pressKey(page, 'w', 500);
        await waitForPropertyValue(page, 'speed', (value) => parseFloat(value) > initialSpeed);
    });

    test('keyboard thrust controls update boost command', async ({ page }) => {
        await page.keyboard.press('w');
        await waitForPropertyFloatValue(page, 'boostCommand', 0.05);

        await page.keyboard.press('s');
        await waitForPropertyFloatValue(page, 'boostCommand', -0.05);
    });

    test('keyboard strafe controls update strafe command', async ({ page }) => {
        await page.keyboard.press('a');
        await waitForPropertyFloatValue(page, 'strafeCommand', -0.05);

        await page.keyboard.press('d');
        await waitForPropertyFloatValue(page, 'strafeCommand', 0.05);
    });

    test('displays energy level', async ({ page }) => {
        const ship = gameDriver.getShip(shipId);

        await waitForPropertyFloatValue(page, 'energy', ship.state.reactor.energy, undefined, 10);
        expect(parseFloat(await getPropertyValue(page, 'energy'))).toBeGreaterThan(0);
    });

    test('displays afterburner fuel level', async ({ page }) => {
        const ship = gameDriver.getShip(shipId);

        await waitForPropertyFloatValue(page, 'afterBurnerFuel', ship.state.maneuvering.afterBurnerFuel, undefined, 1);
        expect(parseFloat(await getPropertyValue(page, 'afterBurnerFuel'))).toBeGreaterThanOrEqual(0);
    });

    test('displays turn speed', async ({ page }) => {
        const spaceShip = getSpaceShipObject();
        await waitForPropertyFloatValue(page, 'turn speed', spaceShip.turnSpeed, undefined, 1);
    });

    test('displays rotation mode', async ({ page }) => {
        await waitForPropertyValue(page, 'rotationMode', (value) => value.length > 0 && value !== 'undefined');
        const rotationMode = await getPropertyValue(page, 'rotationMode');
        expect(rotationMode).toBeDefined();
        expect(rotationMode.length).toBeGreaterThan(0);
    });

    test('displays maneuvering mode', async ({ page }) => {
        await waitForPropertyValue(page, 'maneuveringMode', (value) => value.length > 0 && value !== 'undefined');
        const maneuveringMode = await getPropertyValue(page, 'maneuveringMode');
        expect(maneuveringMode).toBeDefined();
        expect(maneuveringMode.length).toBeGreaterThan(0);
    });

    test('warp controls with keyboard', async ({ page }) => {
        const ship = gameDriver.getShip(shipId);
        const initialWarpLevel = ship.state.warp.desiredLevel;

        await page.keyboard.press('r');
        await waitForPropertyValue(page, 'Designated LVL', (value) => parseFloat(value) > initialWarpLevel, 'Warp');

        const newWarpLevel = ship.state.warp.desiredLevel;
        await page.keyboard.press('f');
        await waitForPropertyValue(page, 'Designated LVL', (value) => parseFloat(value) < newWarpLevel, 'Warp');
    });

    test('pilot radar updates when ship moves', async ({ page }) => {
        const pilotRadar = await waitForPilotRadar(page);
        const ship = gameDriver.getShip(shipId);
        const initialSpeed = ship.state.speed;

        const initialRadar = await pilotRadar.screenshot();

        await pressKey(page, 'w', 1000);
        await waitForPropertyValue(page, 'speed', (value) => parseFloat(value) > initialSpeed + 10);

        expect(await pilotRadar.screenshot()).not.toEqual(initialRadar);
    });
});

async function waitForPilotRadar(page: Page): Promise<Locator> {
    const pilotRadar = page.locator('[data-id="Pilot Radar"]');
    await expect(pilotRadar).toBeVisible({ timeout: 10000 });
    return pilotRadar;
}

function getSpaceShipObject() {
    const ship = gameDriver.gameManager.spaceManager.state.getShip(shipId);
    if (!ship) throw new Error('ship not found in space');
    return ship;
}

async function pressKey(page: Page, key: string, duration: number) {
    await page.keyboard.down(key);
    await page.waitForTimeout(duration);
    await page.keyboard.up(key);
}
