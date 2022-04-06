import * as path from 'path';

import { Asteroid, Faction, Spaceship, Vec2 } from '@starwards/model';
import { expect, test } from '@playwright/test';

import { GameApi } from '@starwards/server/src/admin/scripts-api';
import { GameManager } from '@starwards/server/src/admin/game-manager';
import { server } from '@starwards/server/src/server';

let gameManager: GameManager | null = null;
test.beforeAll(async () => {
    gameManager = new GameManager();
    await server(8080, path.resolve(__dirname, '..', '..', '..', 'static'), gameManager);
});

test.afterEach(async () => {
    await gameManager?.stopGame();
});

test('start and stop a game', async ({ page }) => {
    if (!gameManager) throw new Error('missing gameManager');
    await page.goto(`/`);
    await expect(page.locator('[data-id="title"]')).toHaveText('Starwards');
    expect(gameManager.state.isGameRunning).toBe(false);
    const newGame = page.locator('[data-id="new game"]');
    await newGame.click({ delay: 200 });
    await newGame.waitFor({ state: 'detached' });
    expect(gameManager.state.isGameRunning).toBe(true);
    await page.locator('[data-id="stop game"]').click({ delay: 200 });
    await newGame.waitFor({ state: 'visible' });
    expect(gameManager.state.isGameRunning).toBe(false);
});

const testShipId = 'GVTS';
const testMap = {
    init: (game: GameApi) => {
        const ship = new Spaceship().init(testShipId, new Vec2(0, 0));
        ship.faction = Faction.Gravitas;
        game.addSpaceship(ship);
        const asteroid = new Asteroid().init('astro', new Vec2(1000, 3000));
        asteroid.radius = 350;
        game.addObject(asteroid);
    },
};

test('tactical radar view', async ({ page }) => {
    if (!gameManager) throw new Error('missing gameManager');
    await gameManager.startGame(testMap);
    await page.goto(`/ship.html?ship=${testShipId}`);
    await page.locator('[data-id="menu-tactical radar"]').dragTo(page.locator('#layoutContainer'));
    const radarCanvas = page.locator('[data-id="Tactical Radar"]');
    expect(await radarCanvas.screenshot()).toMatchSnapshot();
});
