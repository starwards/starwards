import { Asteroid, Faction, Spaceship, Vec2 } from '@starwards/model';
import { RadarDriver, makeDriver } from './driver';
import { expect, test } from '@playwright/test';

import { GameApi } from '@starwards/server/src/admin/scripts-api';

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
        const ship = new Spaceship().init(testShipId, new Vec2(0, 0), 'dragonfly-SF22');
        ship.faction = Faction.Gravitas;
        game.addSpaceship(ship);
        const asteroidHiddenInRange = new Asteroid().init('astro1', new Vec2(2000, 2000));
        asteroidHiddenInRange.radius = 200;
        game.addObject(asteroidHiddenInRange);
        const asteroidInRange = new Asteroid().init('astro2', new Vec2(1000, 1000));
        asteroidInRange.radius = 350;
        game.addObject(asteroidInRange);
        const asteroidOutOfRange = new Asteroid().init('astro3', new Vec2(3000, -2000));
        asteroidOutOfRange.radius = 50;
        game.addObject(asteroidOutOfRange);
    },
};

test('armor view', async ({ page }) => {
    await gameDriver.gameManager.startGame(testMap);
    await page.goto(`/ship.html?ship=${testShipId}`);
    await page.locator('[data-id="menu-armor"]').dragTo(page.locator('#layoutContainer'));
    const radarCanvas = page.locator('[data-id="Armor"]');
    expect(await radarCanvas.screenshot()).toMatchSnapshot();
});

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

test('GM view', async ({ page }) => {
    await gameDriver.gameManager.startGame(testMap);
    const ship = gameDriver.gameManager.scriptApi.getShip(testShipId);
    if (!ship) {
        throw new Error(`ship ${testShipId} not found`);
    }
    ship.spaceObject.radarRange = 3_000;
    await page.goto(`/gm.html`);
    const radar = new RadarDriver(page.locator('[data-id="GM Radar"]'));
    await radar.setZoom(0.1);
    expect(await radar.canvas.screenshot()).toMatchSnapshot();
});
