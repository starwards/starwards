import { Asteroid, Faction, Spaceship, Vec2 } from '@starwards/model';
import { expect, test } from '@playwright/test';

import { GameApi } from '@starwards/server/src/admin/scripts-api';
import { makeDriver } from './driver';

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

const testShipId = 'GVTS';
const testMap = {
    init: (game: GameApi) => {
        const ship = new Spaceship().init(testShipId, new Vec2(0, 0));
        ship.faction = Faction.Gravitas;
        game.addSpaceship(ship);
        const asteroid = new Asteroid().init('astro', new Vec2(3000, 1000));
        asteroid.radius = 350;
        game.addObject(asteroid);
    },
};

test('tactical radar view', async ({ page }) => {
    await gameDriver.gameManager.startGame(testMap);
    await page.goto(`/ship.html?ship=${testShipId}`);
    await page.locator('[data-id="menu-tactical radar"]').dragTo(page.locator('#layoutContainer'));
    const radarCanvas = page.locator('[data-id="Tactical Radar"]');
    expect(await radarCanvas.screenshot()).toMatchSnapshot();
});

test('main screen', async ({ page }) => {
    test.setTimeout(1 * 60 * 1000);
    await gameDriver.gameManager.startGame(testMap);
    await page.goto(`/main-screen.html?ship=${testShipId}`);
    const canvas = page.locator('[data-id="3dCanvas"][data-loaded="true"]');
    expect(await canvas.screenshot()).toMatchSnapshot();
});
