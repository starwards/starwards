import { RadarDriver, makeDriver } from './driver';
import { expect, test } from '@playwright/test';

import { maps } from '@starwards/server';

const { test_map_1 } = maps;
const gameDriver = makeDriver(test);

test('start and stop a game', async ({ page }) => {
    await page.goto(`${gameDriver.baseURL}/`);
    await expect(page.locator('[data-id="title"]')).toHaveText('Starwards');
    expect(gameDriver.gameManager.state.isGameRunning).toBe(false);
    const newGame = page.locator('[data-id="new game"]');
    await newGame.click({ delay: 200 });
    await newGame.waitFor({ state: 'detached' });
    expect(gameDriver.gameManager.state.isGameRunning).toBe(true);
    // Use .first() to handle potential duplicate elements
    await page.locator('[data-id="stop game"]').first().click({ delay: 200 });
    await newGame.first().waitFor({ state: 'visible' });
    expect(gameDriver.gameManager.state.isGameRunning).toBe(false);
});

test('armor view', async ({ page }) => {
    await gameDriver.gameManager.startGame(test_map_1);
    await page.goto(`${gameDriver.baseURL}/ship.html?ship=${test_map_1.testShipId}`);
    await page.locator('[data-id="menu-armor"]').dragTo(page.locator('#layoutContainer'));
    const canvas = page.locator('[data-id="Armor"]');
    await canvas.waitFor({ state: 'visible' });
    await canvas.waitFor({ state: 'attached' });
    await expect(canvas).toHaveAttribute('data-loaded', 'true', { timeout: 5000 });
    await page.waitForTimeout(100); // Let first frame render
    expect(await canvas.screenshot({ animations: 'disabled', timeout: 10000 })).toMatchSnapshot();
});

test('tactical radar view', async ({ page }) => {
    await gameDriver.gameManager.startGame(test_map_1);
    await page.goto(`${gameDriver.baseURL}/ship.html?ship=${test_map_1.testShipId}`);
    await page.locator('[data-id="menu-tactical radar"]').dragTo(page.locator('#layoutContainer'));
    const radarCanvas = page.locator('[data-id="Tactical Radar"]');
    await radarCanvas.waitFor({ state: 'visible' });
    await page.waitForTimeout(100); // Let first frame render
    expect(await radarCanvas.screenshot({ animations: 'disabled', timeout: 10000 })).toMatchSnapshot();
});

test('GM view', async ({ page }) => {
    await gameDriver.gameManager.startGame(test_map_1);
    // Configure radar to match expected snapshot (3000 range)
    const ship = gameDriver.getShip(test_map_1.testShipId);
    ship.state.radar.power = 1;
    ship.state.radar.design.range = 3000;
    await page.goto(`${gameDriver.baseURL}/gm.html`);
    const radar = new RadarDriver(page.locator('[data-id="GM Radar"]'));
    await radar.setZoom(0.1);
    expect(await radar.canvas.screenshot({ timeout: 10000 })).toMatchSnapshot();
});
