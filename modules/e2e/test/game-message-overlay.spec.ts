import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';

import { makeDriver } from './driver';
import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

test.describe('Game message overlay', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
        await navigateToScreen(page, `/helms.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
        await expect(page.locator('[data-id="Helms Radar"]')).toBeVisible({ timeout: 10000 });
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('shows the scenario end-of-game message on the station screen, and clears when the message clears', async ({
        page,
    }) => {
        await expect(page.locator('[data-id="Game Message"]')).toBeHidden();

        gameDriver.gameManager.scriptApi.setMessage('Defeat: every station was lost during wave 3.');

        const messageEl = page.locator('[data-id="Game Message"]');
        await expect(messageEl).toBeVisible({ timeout: 10000 });
        await expect(messageEl).toHaveText('Defeat: every station was lost during wave 3.');
        // radar stays visible behind the banner — this is the paused end-state, not a broken screen
        await expect(page.locator('[data-id="Helms Radar"]')).toBeVisible();

        gameDriver.gameManager.scriptApi.setMessage('');
        await expect(messageEl).toBeHidden({ timeout: 10000 });
    });

    test('queued messages show one after another on the station screen', async ({ page }) => {
        const messageEl = page.locator('[data-id="Game Message"]');
        gameDriver.gameManager.scriptApi.pushMessage('Station A lost', 1);
        gameDriver.gameManager.scriptApi.pushMessage('Station B lost', 1);
        await expect(messageEl).toHaveText('Station A lost', { timeout: 10000 });
        await expect(messageEl).toHaveText('Station B lost', { timeout: 10000 });
        await expect(messageEl).toBeHidden({ timeout: 10000 });
    });

    test('announces a broken player-ship system on the station screen', async ({ page }, testInfo) => {
        const messageEl = page.locator('[data-id="Game Message"]');
        await expect(messageEl).toBeHidden();

        gameDriver.getShip(shipId).state.chainGuns.values().next().value!.rateOfFireFactor = 0;

        await expect(messageEl).toBeVisible({ timeout: 10000 });
        await expect(messageEl).toHaveText(
            `System broken: ${shipId} ${gameDriver.getShip(shipId).state.chainGuns.values().next().value!.name}`,
        );
        await testInfo.attach('system-broken-banner', {
            body: await page.screenshot(),
            contentType: 'image/png',
        });
    });
});
