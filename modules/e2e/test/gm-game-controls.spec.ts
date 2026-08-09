import { Page, expect, test } from '@playwright/test';
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';

import { makeDriver } from './driver';
import { maps } from '@starwards/server';

const { single_ship } = maps;
const gameDriver = makeDriver(test);

/**
 * The widget is in the GM's default layout, as the tab after `create`: a GM who has to go find
 * it in the widget menu has no way to notice that a recording is running. Selecting the tab also
 * covers the widget's construction — one that throws never renders its pane.
 */
async function openGameControls(page: Page) {
    const controls = page.locator('[data-id="Game Controls"]');
    await expect(controls).toBeVisible({ timeout: 15000 });
    return controls;
}

test.describe('GM game controls widget', () => {
    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('opens by default and drives a live game with rate controls only', async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });

        const controls = await openGameControls(page);
        await expect(controls).toBeVisible({ timeout: 10000 });

        // replay-only controls are absent in a live game — there is nothing to seek through
        await expect(controls.getByText('position', { exact: true })).toBeHidden();
        await expect(controls.getByText('scrub', { exact: true })).toBeHidden();

        await controls.locator('button.tp-btnv_b', { hasText: 'pause' }).click();
        await expect(() => {
            expect(gameDriver.gameManager.state.speed).toBe(0);
        }).toPass({ timeout: 5000 });

        await controls.locator('button.tp-btnv_b', { hasText: 'fast' }).click();
        await expect(() => {
            expect(gameDriver.gameManager.state.speed).toBeGreaterThan(1);
        }).toPass({ timeout: 5000 });
    });

    test('records from the GM screen and confirms what was saved', async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });

        const controls = await openGameControls(page);
        await controls.locator('button.tp-btnv_b', { hasText: 'Record' }).click();
        await expect(() => {
            expect(gameDriver.gameManager.state.isRecordingGame).toBe(true);
        }).toPass({ timeout: 5000 });
        // the chip is what tells the GM a recording is running from any tab
        await expect(page.locator('[data-id="observation-mode"]')).toBeVisible();

        await page.waitForTimeout(2500); // a couple of frames past frame 0
        await controls.locator('button.tp-btnv_b', { hasText: 'Stop Recording' }).click();
        await expect(() => {
            expect(gameDriver.gameManager.state.isRecordingGame).toBe(false);
        }).toPass({ timeout: 5000 });
        // the saved-recording readout is a text blade, so its content lives in an input value
        const lastSaved = controls.locator('.tp-lblv', { hasText: 'last saved' }).locator('input');
        await expect(lastSaved).toHaveValue(/frames/, { timeout: 10000 });
    });

    test('exposes replay position, scrubbing and step-back while a replay is playing', async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
        await page.request.post(`${gameDriver.baseURL}/start-recording`);
        await page.waitForTimeout(2500); // a couple of frames past frame 0
        await page.request.post(`${gameDriver.baseURL}/stop-recording`);
        await page.request.post(`${gameDriver.baseURL}/stop-game`);
        const recordings = (await (await page.request.get(`${gameDriver.baseURL}/recordings`)).json()) as Array<{
            name: string;
        }>;
        await page.request.post(`${gameDriver.baseURL}/start-replay`, { data: { name: recordings[0].name } });

        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });
        const controls = await openGameControls(page);
        await expect(controls).toBeVisible({ timeout: 10000 });

        await expect(controls.getByText('position', { exact: true })).toBeVisible();
        await expect(controls.getByText('scrub', { exact: true })).toBeVisible();
        await expect(controls.locator('button.tp-btnv_b', { hasText: '-10s' })).toBeVisible();
    });
});
