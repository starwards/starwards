import { RadarDriver, makeDriver } from './driver';
import { expect, test } from '@playwright/test';

import { maps } from '@starwards/server';

const { test_map_1 } = maps;
const gameDriver = makeDriver(test);

test('start and stop a game', async ({ page }) => {
    await page.goto(`/`);
    await expect(page.locator('[data-id="title"]')).toHaveText('Starwards');
    expect(gameDriver.gameManager.state.isGameRunning).toBe(false);
    const newGame = page.locator('[data-id="new game"]');
    await newGame.click({ delay: 200 });
    await newGame.waitFor({ state: 'detached' });
    expect(gameDriver.gameManager.state.isGameRunning).toBe(true);
    await page.locator('[data-id="stop game"]').click({ delay: 200 });
    await newGame.waitFor({ state: 'visible' });
    expect(gameDriver.gameManager.state.isGameRunning).toBe(false);
});

test('armor view', async ({ page }) => {
    await gameDriver.gameManager.startGame(test_map_1);
    await page.goto(`/ship.html?ship=${test_map_1.testShipId}`);
    await page.locator('[data-id="menu-armor"]').dragTo(page.locator('#layoutContainer'));
    const radarCanvas = page.locator('[data-id="Armor"]');
    await radarCanvas.waitFor({ state: 'visible' });
    await radarCanvas.waitFor({ state: 'attached' });
    await expect(radarCanvas).toHaveAttribute('data-loaded', 'true', { timeout: 5000 });
    expect(await radarCanvas.screenshot({ timeout: 10000 })).toMatchSnapshot();
});

test('tactical radar view', async ({ page }) => {
    await gameDriver.gameManager.startGame(test_map_1);
    await page.goto(`/ship.html?ship=${test_map_1.testShipId}`);
    await page.locator('[data-id="menu-tactical radar"]').dragTo(page.locator('#layoutContainer'));
    const radarCanvas = page.locator('[data-id="Tactical Radar"]');
    expect(await radarCanvas.screenshot({ timeout: 10000 })).toMatchSnapshot();
});

test('GM view', async ({ page }) => {
    await gameDriver.gameManager.startGame(test_map_1);
    gameDriver.gameManager.spaceManager.changeShipRadarRange(test_map_1.testShipId, 3_000);
    await page.goto(`/gm.html`);
    const radar = new RadarDriver(page.locator('[data-id="GM Radar"]'));
    await radar.setZoom(0.1);
    expect(await radar.canvas.screenshot({ timeout: 10000 })).toMatchSnapshot();
});
