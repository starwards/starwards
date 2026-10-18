import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';

import { Download } from '@playwright/test';
import { makeDriver } from './driver';
import { maps } from '@starwards/server';

const { two_vs_one } = maps;
const gameDriver = makeDriver(test);

test.describe('GM bot seats', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(two_vs_one);
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('GM seats a bot from the roster and records its decisions', async ({ page }) => {
        test.setTimeout(60_000);
        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });
        await page.locator('.lm_title', { hasText: 'roster' }).click();
        await expect(page.locator('[data-id="Station Roster"]')).toBeVisible({ timeout: 10000 });

        const row = page.locator('[data-id="Roster Seat GVTS pilot"]');
        const status = page.locator('[data-id="Roster Bot Status GVTS pilot"]');
        await expect(row).toHaveAttribute('data-unassigned', 'true');
        await page.locator('[data-id="Roster Bot GVTS pilot"]').selectOption('reference');
        // 'starting' is transient, so wait on the server's status, then check the roster shows running (no text)
        await expect
            .poll(() => gameDriver.gameManager.state.bots.get('GVTS')?.seats.get('pilot')?.status, { timeout: 15000 })
            .toBe('running');
        await expect(status).toHaveText('', { timeout: 5000 });
        await expect(row).toHaveAttribute('data-unassigned', 'false');

        await page.locator('.lm_title', { hasText: 'controls' }).click();
        const controls = page.locator('[data-id="Game Controls"]');
        await expect(controls).toBeVisible({ timeout: 15000 });
        await controls.locator('button.tp-btnv_b', { hasText: 'Record' }).click();
        await expect(() => expect(gameDriver.gameManager.state.isRecordingGame).toBe(true)).toPass({ timeout: 5000 });
        await page.waitForTimeout(5000);
        const downloads: Download[] = [];
        page.on('download', (d) => downloads.push(d));
        await controls.locator('button.tp-btnv_b', { hasText: 'Stop Recording' }).click();
        await expect.poll(() => downloads.length, { timeout: 10000 }).toBe(2);
        const names = downloads.map((d) => d.suggestedFilename());
        expect(names.some((n) => n.endsWith('.sgr'))).toBe(true);
        expect(names.some((n) => n.endsWith('.events.jsonl'))).toBe(true);

        await page.locator('.lm_title', { hasText: 'roster' }).click();
        await page.locator('[data-id="Roster Bot GVTS pilot"]').selectOption('none');
        await expect(row).toHaveAttribute('data-unassigned', 'true', { timeout: 5000 });
        expect(gameDriver.gameManager.state.bots.get('GVTS')?.seats.get('pilot')).toBeUndefined();
    });
});
