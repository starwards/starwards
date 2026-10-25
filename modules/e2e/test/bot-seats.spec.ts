import { Download, Page } from '@playwright/test';
import { EVENTS_EXT, RECORDING_EXT } from '@starwards/core';
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';

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

    async function openRoster(page: Page) {
        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });
        await page.locator('.lm_title', { hasText: 'roster' }).click();
        await expect(page.locator('[data-id="Station Roster"]')).toBeVisible({ timeout: 10000 });
    }
    const roster = (page: Page) => ({
        row: (seat: string) => page.locator(`[data-id="Roster Seat GVTS ${seat}"]`),
        status: (seat: string) => page.locator(`[data-id="Roster Bot Status GVTS ${seat}"]`),
        seatBot: (seat: string) => page.locator(`[data-id="Roster Bot Seat reference GVTS ${seat}"]`),
        remove: (seat: string) => page.locator(`[data-id="Roster Bot Remove GVTS ${seat}"]`),
        restart: (seat: string) => page.locator(`[data-id="Roster Bot Restart GVTS ${seat}"]`),
    });
    const serverBot = (seat: string) => gameDriver.gameManager.state.bots.get('GVTS')?.seats.get(seat);
    const waitRunning = (seat: string) =>
        expect.poll(() => serverBot(seat)?.status, { timeout: 15000 }).toBe('running');

    test('GM seats a bot from the roster and records its decisions', async ({ page }) => {
        test.setTimeout(60_000);
        await openRoster(page);
        const r = roster(page);
        await expect(r.row('pilot')).toHaveAttribute('data-unassigned', 'true');
        await expect(r.status('pilot')).toHaveText('none');
        await expect(r.remove('pilot')).toBeHidden();
        await r.seatBot('pilot').click();
        await waitRunning('pilot');
        await expect(r.status('pilot')).toHaveText('reference running', { timeout: 5000 });
        await expect(r.seatBot('pilot')).toBeHidden();
        await expect(r.row('pilot')).toHaveAttribute('data-unassigned', 'false');

        await page.locator('.lm_title', { hasText: /^game$/ }).click();
        const controls = page.locator('[data-id="Game Controls"]');
        await expect(controls).toBeVisible({ timeout: 15000 });
        // every game records from its start
        await expect(() => expect(gameDriver.gameManager.state.isRecordingGame).toBe(true)).toPass({ timeout: 5000 });
        await page.waitForTimeout(5000);
        const downloads: Download[] = [];
        page.on('download', (d) => downloads.push(d));
        await controls.getByRole('button', { name: 'Stop Recording', exact: true }).click();
        await expect.poll(() => downloads.length, { timeout: 10000 }).toBe(2);
        const names = downloads.map((d) => d.suggestedFilename());
        expect(names.some((n) => n.endsWith(RECORDING_EXT))).toBe(true);
        expect(names.some((n) => n.endsWith(EVENTS_EXT))).toBe(true);

        await page.locator('.lm_title', { hasText: 'roster' }).click();
        await r.remove('pilot').click();
        await expect(r.row('pilot')).toHaveAttribute('data-unassigned', 'true', { timeout: 5000 });
        expect(serverBot('pilot')).toBeUndefined();
    });

    test('restart brings a failed bot back', async ({ page }) => {
        await openRoster(page);
        const r = roster(page);
        await r.seatBot('engineer').click();
        await waitRunning('engineer');
        const failed = serverBot('engineer')!;
        gameDriver.gameManager.setBotStatus('GVTS', 'engineer', failed.id, 'failed', 'boom');
        await expect(r.status('engineer')).toHaveText('reference failed: boom', { timeout: 5000 });
        await expect(r.restart('engineer')).toBeVisible();
        await r.restart('engineer').click();
        await expect.poll(() => serverBot('engineer')?.id, { timeout: 5000 }).not.toBe(failed.id);
        await waitRunning('engineer');
        await expect(r.restart('engineer')).toBeHidden();
    });

    test('a tactical bot greys out the pilot and weapons bot buttons, not their screens', async ({ page }) => {
        await openRoster(page);
        const r = roster(page);
        await r.seatBot('tactical').click();
        await expect(r.seatBot('pilot')).toBeDisabled({ timeout: 5000 });
        await expect(r.seatBot('weapons')).toBeDisabled();
        await expect(r.seatBot('pilot')).toHaveAttribute('title', /tactical/);
        await expect(r.row('pilot')).toHaveAttribute('data-unassigned', 'false');
        await expect(r.seatBot('engineer')).toBeEnabled();
        await expect(page.locator(`[data-id="Roster Screen GVTS helms"]`)).toBeEnabled();

        await r.remove('tactical').click();
        await expect(r.seatBot('pilot')).toBeEnabled({ timeout: 5000 });
        await expect(r.seatBot('weapons')).toBeEnabled();
    });

    test('warns while bots run without a recording', async ({ page }) => {
        test.setTimeout(60_000);
        const post = async (path: string) =>
            expect((await page.request.post(`${gameDriver.baseURL}${path}`, { data: {} })).ok()).toBe(true);
        // let the recording every game starts with get going (named, first frame written) before stopping it
        await expect.poll(() => gameDriver.gameManager.state.recordingName, { timeout: 5000 }).not.toBe('');
        await page.waitForTimeout(1500);
        await post('/stop-recording');
        await expect.poll(() => gameDriver.gameManager.state.isRecordingGame, { timeout: 5000 }).toBe(false);
        await openRoster(page);
        const banner = page.locator('[data-id="Roster Bots Not Recording"]');
        await expect(banner).toBeHidden();
        await roster(page).seatBot('engineer').click();
        await expect(banner).toBeVisible({ timeout: 5000 });
        await post('/start-recording');
        await expect(banner).toBeHidden({ timeout: 5000 });
        await post('/stop-recording');
        await expect(banner).toBeVisible({ timeout: 5000 });
    });

    test('reset clears every screen assignment and bot', async ({ page, browser }) => {
        const stationContext = await browser.newContext();
        const stationPage = await stationContext.newPage();
        setupPageErrorHandlers(stationPage);
        await navigateToScreen(stationPage, '/station.html', { baseURL: gameDriver.baseURL });
        const waitingId = stationPage.locator('[data-id="Waiting Screen"] [data-id="station-id"]');
        await expect(waitingId).toBeVisible({ timeout: 10000 });
        const stationId = (await waitingId.textContent())!.trim();

        await openRoster(page);
        const r = roster(page);
        const engineerScreen = page.locator('[data-id="Roster Screen GVTS engineer"]');
        await expect(page.locator(`[data-id="Roster Unassigned ${stationId}"]`)).toBeVisible({ timeout: 10000 });
        await engineerScreen.selectOption(stationId);
        await expect
            .poll(() => gameDriver.gameManager.state.stations.get(stationId)?.shipId, { timeout: 5000 })
            .toBe('GVTS');
        await r.seatBot('pilot').click();
        await waitRunning('pilot');

        await page.locator('[data-id="Roster Reset"]').click();
        await expect(r.status('pilot')).toHaveText('none', { timeout: 5000 });
        await expect(engineerScreen).toHaveValue('', { timeout: 5000 });
        expect(gameDriver.gameManager.state.bots.size).toBe(0);
        expect(gameDriver.gameManager.state.stations.get(stationId)?.shipId).toBe('');
        expect(gameDriver.gameManager.state.stations.get(stationId)?.stationType).toBe('');
        await stationContext.close();
    });
});
