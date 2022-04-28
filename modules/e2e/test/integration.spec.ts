import { Asteroid, Faction, Spaceship, Vec2, limitPercision } from '@starwards/model';
import { Locator, expect, test } from '@playwright/test';

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

async function getRadarZoom(radarCanvas: Locator) {
    return limitPercision(Number(await radarCanvas.getAttribute('data-zoom')));
}
async function zoom(radarCanvas: Locator, targetZoomLevel: number) {
    const page = radarCanvas.page();
    await radarCanvas.hover();
    const f = 1000 * (targetZoomLevel / (await getRadarZoom(radarCanvas)) - 1); // tightly coupled logic from Camera and radarWidget logic
    await page.mouse.wheel(0, -f);
    expect(await getRadarZoom(radarCanvas)).toEqual(targetZoomLevel);
}

test('GM view', async ({ page }) => {
    await gameDriver.gameManager.startGame(testMap);
    const ship = gameDriver.gameManager.scriptApi.getShip(testShipId);
    if (!ship) {
        throw new Error(`ship ${testShipId} not found`);
    }
    ship.spaceObject.radarRange = 3_000;
    await page.goto(`/gm.html`);
    // const zoomOut = page.locator('[data-id="zoom_out"]');
    const radarCanvas = page.locator('[data-id="GM Radar"]');
    // await radarCanvas.waitFor({ state: 'visible' });
    // await zoomOut.waitFor({ state: 'visible' });
    await zoom(radarCanvas, 0.1);
    expect(await radarCanvas.screenshot()).toMatchSnapshot();
});
