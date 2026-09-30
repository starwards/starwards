import * as fs from 'node:fs';
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

    test('opens by default and drives a live game with rate controls', async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });

        const controls = await openGameControls(page);
        await expect(controls).toBeVisible({ timeout: 10000 });

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
        // ending the recording hands the file to the GM's browser
        const download = page.waitForEvent('download');
        await controls.locator('button.tp-btnv_b', { hasText: 'Stop Recording' }).click();
        await expect(() => {
            expect(gameDriver.gameManager.state.isRecordingGame).toBe(false);
        }).toPass({ timeout: 5000 });
        expect((await download).suggestedFilename()).toMatch(/.swr.jsonl$/);
        const file = await (await download).path();
        expect(fs.readFileSync(file, 'utf8')).toContain('starwards-recording');
        // the saved-recording readout is a text blade, so its content lives in an input value
        const lastSaved = controls.locator('.tp-lblv', { hasText: 'last saved' }).locator('input');
        await expect(lastSaved).toHaveValue(/frames/, { timeout: 10000 });
    });
});
