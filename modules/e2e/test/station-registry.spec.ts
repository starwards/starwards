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
        // `useConnectedStationIds` is event-driven, not polled, but the state still has to sync
        // from the server over the wire — retry the rename attempt instead of a blind wait.
        await expect(async () => {
            await page.locator('[data-id="station-id-input"]').fill('DUP');
            await page.getByRole('button', { name: 'Rename' }).click();
            await expect(page.locator('[data-id="station-id-error"]')).toBeVisible({ timeout: 500 });
        }).toPass({ timeout: 5000 });
        await expect(page.locator('[data-id="station-id"]')).not.toHaveText('DUP');

        await otherContext.close();
    });

    test('two tabs in the same browser context register as two distinct stations', async ({ page, context }) => {
        // Same context as `page` (not `browser.newContext()`): shared localStorage, distinct
        // sessionStorage per tab — the scenario the per-tab identity fix (issue #2131 review)
        // targets. No `?ship=` on either: identity resolution alone is under test here.
        const pageA = await context.newPage();
        setupPageErrorHandlers(pageA);
        await navigateToScreen(pageA, '/pilot.html', { baseURL: gameDriver.baseURL });

        const pageB = await context.newPage();
        setupPageErrorHandlers(pageB);
        await navigateToScreen(pageB, '/pilot.html', { baseURL: gameDriver.baseURL });

        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });
        const roster = page.locator('[data-id="Station Roster"]');
        await expect(roster).toBeVisible({ timeout: 10000 });
        await expect
            .poll(() => roster.locator('[data-id^="Station Roster Row "]').count(), { timeout: 10000 })
            .toBeGreaterThanOrEqual(2);

        const rowTexts = await roster.locator('[data-id^="Station Roster Row "]').allTextContents();
        const ids = rowTexts.map((text) => text.trim().split(' ')[1]);
        expect(new Set(ids).size).toBe(ids.length);

        await pageA.close();
        await pageB.close();
    });

    test('a lobby rename retires the old station id from the GM roster', async ({ page }) => {
        await navigateToScreen(page, '/', { baseURL: gameDriver.baseURL });
        const badge = page.locator('[data-id="station-id"]');
        await expect(badge).toBeVisible({ timeout: 10000 });
        const originalId = await badge.textContent();

        await page.locator('[data-id="station-id-input"]').fill('RENAMED');
        await page.getByRole('button', { name: 'Rename' }).click();
        await expect(badge).toHaveText('RENAMED');

        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });
        const roster = page.locator('[data-id="Station Roster"]');
        await expect(roster).toBeVisible({ timeout: 10000 });
        // The renamed id is the one now connected; the old id's row is retired (flips to
        // disconnected — '○' — in the same drain as the rename) rather than disappearing
        // outright, so a GM can still see it was here. It's only pruned from the roster
        // entirely after the disconnected-and-unassigned grace period (~30s).
        await expect(roster.locator('[data-id="Station Roster Row RENAMED"]')).toContainText('●', { timeout: 10000 });
        if (originalId) {
            await expect(roster.locator(`[data-id="Station Roster Row ${originalId}"]`)).toContainText('○');
        }
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

// Issue #2132: the generic `station.html` page (no `?ship=`, no fixed station type) sits in
// standby showing its own id until the GM assigns it a ship + station type from the roster.
test.describe('GM station assignment', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(two_vs_one);
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('roster and game setup controls are visible before the game starts', async ({ page }) => {
        await gameDriver.gameManager.stopGame();
        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });
        await expect(page.locator('[data-id="Station Roster"]')).toBeVisible({ timeout: 10000 });
        const gameSetup = page.locator('[data-id="Game Setup"]');
        await expect(gameSetup).toBeVisible({ timeout: 10000 });
        await expect(gameSetup.locator('button.tp-btnv_b', { hasText: '2v1 Game' })).toBeVisible();
    });

    test('GM assigns a generic station to a ship + type, and reassigns it live without reload', async ({
        page,
        browser,
    }) => {
        const stationContext = await browser.newContext();
        const stationPage = await stationContext.newPage();
        setupPageErrorHandlers(stationPage);
        await navigateToScreen(stationPage, '/station.html', { baseURL: gameDriver.baseURL });

        const standby = stationPage.locator('[data-id="Standby"]');
        await expect(standby).toBeVisible({ timeout: 10000 });
        const stationId = (await standby.textContent())?.trim();
        expect(stationId).toHaveLength(3);

        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });
        const roster = page.locator('[data-id="Station Roster"]');
        await expect(roster).toBeVisible({ timeout: 10000 });
        const row = roster.locator(`[data-id="Station Roster Row ${stationId}"]`);
        await expect(row).toBeVisible({ timeout: 10000 });

        await row.locator('[data-id="Station Roster Ship"]').selectOption('GVTS');
        await row.locator('[data-id="Station Roster Type"]').selectOption('pilot');

        await expect(stationPage.locator('[data-id="Pilot Radar"]')).toBeVisible({ timeout: 10000 });
        await expect
            .poll(() => gameDriver.gameManager.state.stations.get(stationId!)?.shipId, { timeout: 5000 })
            .toBe('GVTS');

        // reassign live: same station type, different ship — no reload of the station tab
        await row.locator('[data-id="Station Roster Ship"]').selectOption('GVTS2');
        await expect
            .poll(() => gameDriver.gameManager.state.stations.get(stationId!)?.shipId, { timeout: 5000 })
            .toBe('GVTS2');
        await expect(stationPage.locator('[data-id="Pilot Radar"]')).toBeVisible({ timeout: 10000 });

        await stationContext.close();
    });
});
