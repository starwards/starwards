import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';

import { makeDriver } from './driver';
import { maps } from '@starwards/server';

const { two_vs_one } = maps;
const gameDriver = makeDriver(test);

// Issue #2131: stations register with a persistent identity and self-assign to a ship over the
// admin room, instead of a station screen trusting its raw `?ship=` url param directly.

test.describe('Station registry', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(two_vs_one);
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('lobby shows the station id and allows renaming it', async ({ page }) => {
        await navigateToScreen(page, '/', { baseURL: gameDriver.baseURL });
        const badge = page.locator('[data-id="station-id"]');
        await expect(badge).toBeVisible({ timeout: 10000 });
        const originalId = await badge.textContent();
        expect(originalId).toHaveLength(3);

        await page.locator('[data-id="station-id-input"]').fill('NAV');
        await page.getByRole('button', { name: 'Rename' }).click();
        await expect(badge).toHaveText('NAV');

        await page.screenshot({ path: 'test-results/station-registry-lobby.png' });
    });

    test('rejects a rename to an id currently connected', async ({ page, browser }) => {
        // A separate browser *context* (not just a second page/tab) — distinct localStorage,
        // matching two different physical stations. Two tabs sharing one browser profile would
        // share the same persisted station id, which isn't the scenario this test covers.
        const otherContext = await browser.newContext();
        const otherPage = await otherContext.newPage();
        setupPageErrorHandlers(otherPage);
        await navigateToScreen(otherPage, '/', { baseURL: gameDriver.baseURL });
        await otherPage.locator('[data-id="station-id-input"]').fill('DUP');
        await otherPage.getByRole('button', { name: 'Rename' }).click();
        await expect(otherPage.locator('[data-id="station-id"]')).toHaveText('DUP');
        // The rename's registerStation command is fire-and-forget from the client's point of
        // view — wait for the server to actually record it as connected before relying on the
        // OTHER page's collision check, which reads that same server-side roster.
        await expect
            .poll(() => gameDriver.gameManager.state.stations.get('DUP')?.connected, { timeout: 3000 })
            .toBe(true);

        await navigateToScreen(page, '/', { baseURL: gameDriver.baseURL });
        // The lobby's collision set is polled every 500ms (useConnectedStationIds) — give it a
        // beat to pick up 'DUP' before relying on it for the rename attempt below.
        await page.waitForTimeout(700);
        await page.locator('[data-id="station-id-input"]').fill('DUP');
        await page.getByRole('button', { name: 'Rename' }).click();
        await expect(page.locator('[data-id="station-id-error"]')).toBeVisible();
        await expect(page.locator('[data-id="station-id"]')).not.toHaveText('DUP');

        await otherContext.close();
    });

    test('GM roster shows a station bound to its self-assigned ship', async ({ page, browser }) => {
        const pilotContext = await browser.newContext();
        const pilotPage = await pilotContext.newPage();
        setupPageErrorHandlers(pilotPage);
        await navigateToScreen(pilotPage, '/pilot.html?ship=GVTS', {
            baseURL: gameDriver.baseURL,
        });
        await expect(pilotPage.locator('[data-id="Pilot Radar"]')).toBeVisible({ timeout: 10000 });

        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });
        const roster = page.locator('[data-id="Station Roster"]');
        await expect(roster).toBeVisible({ timeout: 10000 });
        await expect(roster).toContainText('pilot');
        await expect(roster).toContainText('GVTS');

        await page.screenshot({ path: 'test-results/station-registry-gm-roster.png' });
        await pilotContext.close();
    });
});
