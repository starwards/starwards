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

    // Issue #2242 review: the station id is display-only — no rename field on the lobby badge.
    test('lobby shows the station id, read-only', async ({ page }) => {
        // Issue #2242: a running game routes `/` to the seat — `?lobby` keeps this on the lobby.
        await navigateToScreen(page, '/?lobby', { baseURL: gameDriver.baseURL });
        const badge = page.locator('[data-id="station-id"]');
        await expect(badge).toBeVisible({ timeout: 10000 });
        const originalId = await badge.textContent();
        expect(originalId).toHaveLength(3);
        await expect(page.locator('[data-id="station-id-input"]')).toHaveCount(0);

        await page.screenshot({ path: 'test-results/station-registry-lobby.png' });
    });

    // Issue #2242 review: a Generic Seat button lets a lobby tab jump to the manual station page
    // and back, so a device can switch between the two entry points without retyping a URL.
    test('lobby offers a Generic Seat button that opens the manual station page', async ({ page }) => {
        await navigateToScreen(page, '/?lobby', { baseURL: gameDriver.baseURL });
        await page.getByRole('button', { name: 'Generic Seat' }).click();
        await expect(page.locator('[data-id="Waiting Screen"], [data-id="Standby"]').first()).toBeVisible({
            timeout: 10000,
        });
        expect(page.url()).toContain('station.html');

        await page.locator('[data-id="lobby-breakout"]').click();
        await expect(page.locator('[data-id="title"]')).toBeVisible({ timeout: 10000 });
        expect(page.url()).toContain('lobby');
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

        // Unassigned: waiting screen shows the seat's own id and offers a Lobby breakout.
        const waitingId = stationPage.locator('[data-id="Waiting Screen"] [data-id="station-id"]');
        await expect(waitingId).toBeVisible({ timeout: 10000 });
        const stationId = (await waitingId.textContent())?.trim();
        expect(stationId).toHaveLength(3);
        await expect(stationPage.locator('[data-id="lobby-breakout"]')).toBeVisible();

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

    // Issue #2242: a stopped game must fall back to the waiting screen instead of keeping a
    // (now player-less) assigned screen up. `GameManager`'s reconciliation clears the specific
    // `shipId` the instant `playerShipIds` empties, but leaves `stationType` set — that's the
    // GM's claim on the seat, and it's what keeps the Lobby breakout hidden.
    test('stopping the game returns an assigned seat to the waiting screen, keeping its station type', async ({
        page,
        browser,
    }) => {
        const stationContext = await browser.newContext();
        const stationPage = await stationContext.newPage();
        setupPageErrorHandlers(stationPage);
        await navigateToScreen(stationPage, '/station.html', { baseURL: gameDriver.baseURL });

        const waitingId = stationPage.locator('[data-id="Waiting Screen"] [data-id="station-id"]');
        await expect(waitingId).toBeVisible({ timeout: 10000 });
        const stationId = (await waitingId.textContent())?.trim();

        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });
        const roster = page.locator('[data-id="Station Roster"]');
        const row = roster.locator(`[data-id="Station Roster Row ${stationId}"]`);
        await expect(row).toBeVisible({ timeout: 10000 });
        await row.locator('[data-id="Station Roster Ship"]').selectOption('GVTS');
        await row.locator('[data-id="Station Roster Type"]').selectOption('pilot');
        await expect(stationPage.locator('[data-id="Pilot Radar"]')).toBeVisible({ timeout: 10000 });

        await gameDriver.gameManager.stopGame();

        // Assigned but the game stopped: waiting screen again, no Lobby breakout. The specific
        // shipId is cleared by GameManager's own reconciliation the instant playerShipIds empties
        // (that ship no longer exists), but stationType — the GM's claim on this seat — survives,
        // which is what keeps the breakout hidden and lets the seat auto-resolve a new ship below.
        await expect(stationPage.locator('[data-id="Waiting Screen"] [data-id="station-id"]')).toHaveText(stationId!, {
            timeout: 10000,
        });
        await expect(stationPage.locator('[data-id="lobby-breakout"]')).toHaveCount(0);
        expect(gameDriver.gameManager.state.stations.get(stationId!)?.stationType).toBe('pilot');

        await stationContext.close();
        await gameDriver.gameManager.startGame(two_vs_one);
    });
});

// Issue #2242: a running game or replay routes a fresh lobby load straight to the bridge seat.
test.describe('Lobby entry routing', () => {
    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('a fresh tab redirects from the lobby to the seat while a game is running', async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(two_vs_one);

        await navigateToScreen(page, '/', { baseURL: gameDriver.baseURL });
        await expect(page.locator('[data-id="Waiting Screen"], [data-id="Standby"]').first()).toBeVisible({
            timeout: 10000,
        });
        expect(page.url()).toContain('station.html');

        await gameDriver.gameManager.stopGame();
    });

    test('`?lobby` keeps the lobby open even while a game is running', async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(two_vs_one);

        await navigateToScreen(page, '/?lobby', { baseURL: gameDriver.baseURL });
        await expect(page.locator('[data-id="station-id"]')).toBeVisible({ timeout: 10000 });
        expect(page.url()).not.toContain('station.html');

        await gameDriver.gameManager.stopGame();
    });

    test('the lobby loads normally while no game is running', async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.stopGame();

        await navigateToScreen(page, '/', { baseURL: gameDriver.baseURL });
        await expect(page.locator('[data-id="title"]')).toBeVisible({ timeout: 10000 });
        expect(page.url()).not.toContain('station.html');
    });
});
