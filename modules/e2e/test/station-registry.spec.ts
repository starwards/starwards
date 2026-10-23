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
        await navigateToScreen(pageA, '/helms.html', { baseURL: gameDriver.baseURL });

        const pageB = await context.newPage();
        setupPageErrorHandlers(pageB);
        await navigateToScreen(pageB, '/helms.html', { baseURL: gameDriver.baseURL });

        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });
        await page.locator('.lm_title', { hasText: 'roster' }).click();
        const roster = page.locator('[data-id="Station Roster"]');
        await expect(roster).toBeVisible({ timeout: 10000 });
        const rows = roster.locator('div[data-id^="Roster Unassigned "]');
        await expect.poll(() => rows.count(), { timeout: 10000 }).toBeGreaterThanOrEqual(2);

        const ids = await rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-id')));
        expect(new Set(ids).size).toBe(ids.length);

        await pageA.close();
        await pageB.close();
    });

    test('GM roster shows a station bound to its self-assigned ship', async ({ page, browser }) => {
        const helmsContext = await browser.newContext();
        const helmsPage = await helmsContext.newPage();
        setupPageErrorHandlers(helmsPage);
        await navigateToScreen(helmsPage, '/helms.html?ship=GVTS', {
            baseURL: gameDriver.baseURL,
        });
        await expect(helmsPage.locator('[data-id="Helms Radar"]')).toBeVisible({ timeout: 10000 });

        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });
        await page.locator('.lm_title', { hasText: 'roster' }).click();
        const roster = page.locator('[data-id="Station Roster"]');
        await expect(roster).toBeVisible({ timeout: 10000 });
        await expect(roster.locator('[data-id="Roster Screen GVTS helms"]')).not.toHaveValue('', { timeout: 10000 });
        await expect(roster.locator('[data-id="Roster Seat GVTS pilot"]')).toHaveAttribute('data-unassigned', 'false');

        await page.screenshot({ path: 'test-results/station-registry-gm-roster.png' });
        await helmsContext.close();
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
        const gameSetup = page.locator('[data-id="Game Setup"]');
        await expect(gameSetup).toBeVisible({ timeout: 10000 });
        await expect(gameSetup.locator('button.tp-btnv_b', { hasText: '2v1 Game' })).toBeVisible();
        await page.locator('.lm_title', { hasText: 'roster' }).click();
        await expect(page.locator('[data-id="Station Roster"]')).toBeVisible({ timeout: 10000 });
    });

    test('GM assigns a generic station to a ship + type, and reassigns it live without reload', async ({
        page,
        browser,
    }) => {
        // two live pages with full-viewport software-rendered radars, and each reassignment builds a new one
        test.slow();
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
        await page.locator('.lm_title', { hasText: 'roster' }).click();
        const roster = page.locator('[data-id="Station Roster"]');
        await expect(roster).toBeVisible({ timeout: 10000 });
        await expect(roster.locator(`[data-id="Roster Unassigned ${stationId}"]`)).toBeVisible({ timeout: 10000 });

        await roster.locator('[data-id="Roster Screen GVTS helms"]').selectOption(stationId!);

        await expect(stationPage.locator('[data-id="Helms Radar"]')).toBeVisible({ timeout: 25000 });
        await expect
            .poll(() => gameDriver.gameManager.state.stations.get(stationId!)?.shipId, { timeout: 5000 })
            .toBe('GVTS');

        // reassign live: same station type, different ship — no reload of the station tab
        await roster.locator('[data-id="Roster Screen GVTS2 helms"]').selectOption(stationId!);
        await expect(roster.locator('[data-id="Roster Screen GVTS2 helms"]')).toHaveValue(stationId!, {
            timeout: 5000,
        });
        await expect(roster.locator('[data-id="Roster Screen GVTS helms"]')).not.toHaveValue(stationId!);
        await expect
            .poll(() => gameDriver.gameManager.state.stations.get(stationId!)?.shipId, { timeout: 5000 })
            .toBe('GVTS2');
        await expect(stationPage.locator('[data-id="Helms Radar"]')).toBeVisible({ timeout: 25000 });

        await stationContext.close();
    });

    // Issue #2336: the GM screen is already open when a new station joins — the roster must
    // show it and accept a ship + type assignment live, without reloading the GM screen.
    test('a station joining after the GM screen opened appears live and accepts assignment', async ({
        page,
        browser,
    }) => {
        test.slow();
        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });
        await page.locator('.lm_title', { hasText: 'roster' }).click();
        const roster = page.locator('[data-id="Station Roster"]');
        await expect(roster).toBeVisible({ timeout: 10000 });

        const stationContext = await browser.newContext();
        const stationPage = await stationContext.newPage();
        setupPageErrorHandlers(stationPage);
        await navigateToScreen(stationPage, '/station.html', { baseURL: gameDriver.baseURL });
        const waitingId = stationPage.locator('[data-id="Waiting Screen"] [data-id="station-id"]');
        await expect(waitingId).toBeVisible({ timeout: 10000 });
        const stationId = (await waitingId.textContent())?.trim();

        const row = roster.locator(`[data-id="Roster Unassigned ${stationId}"]`);
        await expect(row).toBeVisible({ timeout: 10000 });
        await expect(roster.locator('[data-id="Roster Screen GVTS helms"]')).toContainText(`● ${stationId}`);

        await row.locator('[data-id="Roster Unassigned Assign"]').selectOption('GVTS|helms');

        await expect
            .poll(() => gameDriver.gameManager.state.stations.get(stationId!)?.shipId, { timeout: 5000 })
            .toBe('GVTS');
        await expect(row).toHaveCount(0, { timeout: 5000 });
        await expect(roster.locator('[data-id="Roster Screen GVTS helms"]')).toHaveValue(stationId!, { timeout: 5000 });
        await expect(stationPage.locator('[data-id="Helms Radar"]')).toBeVisible({ timeout: 25000 });

        await stationContext.close();
    });

    // Issue #2336: roster rows update in place — a dropdown the GM is using must not be torn
    // down and rebuilt (closing it, dropping the pick) when another station joins.
    test('a focused roster dropdown survives another station joining', async ({ page, browser }) => {
        test.slow();
        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });
        await page.locator('.lm_title', { hasText: 'roster' }).click();
        const roster = page.locator('[data-id="Station Roster"]');
        await expect(roster).toBeVisible({ timeout: 10000 });

        const stationContext = await browser.newContext();
        const stationPage = await stationContext.newPage();
        setupPageErrorHandlers(stationPage);
        await navigateToScreen(stationPage, '/station.html', { baseURL: gameDriver.baseURL });
        const waitingId = stationPage.locator('[data-id="Waiting Screen"] [data-id="station-id"]');
        await expect(waitingId).toBeVisible({ timeout: 10000 });
        const stationId = (await waitingId.textContent())?.trim();

        const screenSelect = roster.locator('[data-id="Roster Screen GVTS helms"]');
        await expect(screenSelect.locator(`option[value="${stationId}"]`)).toHaveCount(1, { timeout: 10000 });
        const handle = await screenSelect.elementHandle();
        // an earlier test's sticky entry may already hold the screen: only its value staying put matters
        const valueBefore = await screenSelect.inputValue();
        await screenSelect.focus();

        const otherContext = await browser.newContext();
        const otherPage = await otherContext.newPage();
        setupPageErrorHandlers(otherPage);
        await navigateToScreen(otherPage, '/station.html', { baseURL: gameDriver.baseURL });
        const otherWaitingId = otherPage.locator('[data-id="Waiting Screen"] [data-id="station-id"]');
        await expect(otherWaitingId).toBeVisible({ timeout: 10000 });
        const otherId = (await otherWaitingId.textContent())?.trim();
        await expect(screenSelect.locator(`option[value="${otherId}"]`)).toHaveCount(1, { timeout: 10000 });

        expect(await handle!.evaluate((el) => el.isConnected && el === document.activeElement)).toBe(true);
        await expect(screenSelect).toHaveValue(valueBefore);

        await otherContext.close();
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
        await page.locator('.lm_title', { hasText: 'roster' }).click();
        const roster = page.locator('[data-id="Station Roster"]');
        await expect(roster.locator(`[data-id="Roster Unassigned ${stationId}"]`)).toBeVisible({ timeout: 10000 });
        await roster.locator('[data-id="Roster Screen GVTS helms"]').selectOption(stationId!);
        await expect(stationPage.locator('[data-id="Helms Radar"]')).toBeVisible({ timeout: 10000 });

        await gameDriver.gameManager.stopGame();

        // Assigned but the game stopped: waiting screen again, no Lobby breakout. The specific
        // shipId is cleared by GameManager's own reconciliation the instant playerShipIds empties
        // (that ship no longer exists), but stationType — the GM's claim on this seat — survives,
        // which is what keeps the breakout hidden and lets the seat auto-resolve a new ship below.
        await expect(stationPage.locator('[data-id="Waiting Screen"] [data-id="station-id"]')).toHaveText(stationId!, {
            timeout: 10000,
        });
        await expect(stationPage.locator('[data-id="lobby-breakout"]')).toHaveCount(0);
        expect(gameDriver.gameManager.state.stations.get(stationId!)?.stationType).toBe('helms');

        await stationContext.close();
        await gameDriver.gameManager.startGame(two_vs_one);
    });
});

// Issue #2242: a running game routes a fresh lobby load straight to the bridge seat.
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
