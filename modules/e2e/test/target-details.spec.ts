import { Faction, ScanLevel } from '@starwards/core';
import { Locator, Page, expect, test } from '@playwright/test';
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';

import { getPropertyValue, makeDriver } from './driver';
import { maps } from '@starwards/server';

// two_ships: two same-faction ships and nothing else, so the Signals target cycle is short.
const { two_ships } = maps;
const shipId = two_ships.testShipId;
const targetShipId = two_ships.testTargetShipId;
const gameDriver = makeDriver(test);

function markSignalsTarget(id: string) {
    gameDriver.getShip(shipId).state.signalsTargetId = id;
}

function setTargetScanLevel(level: ScanLevel) {
    gameDriver.gameManager.spaceManager.factionIntel.setScanLevel(targetShipId, Faction.Gravitas, level);
}

async function openTargetDetails(page: Page) {
    await navigateToScreen(page, `/target-details.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
    await expect(page.locator('[data-id="Target"]')).toBeVisible({ timeout: 10000 });
}

function inputValues(panel: Locator) {
    return panel.locator('input').evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).value));
}

// first time the server saw the marked target, relative to the Signals page showing it as Contact
// the game may already be gone when a failed test reaches afterEach
function serverShip(id: string) {
    try {
        return gameDriver.getShip(id).state;
    } catch {
        return undefined;
    }
}

const probe: { contactAt?: number; serverAt?: number; timer?: ReturnType<typeof setInterval> } = {};

test.describe('Target Details screen', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(two_ships);
    });

    test.afterEach(async ({ page }, testInfo) => {
        clearInterval(probe.timer);
        if (testInfo.status !== testInfo.expectedStatus) {
            // bisects server vs client when the page never shows the expected target data
            const ship = serverShip(shipId);
            const target = serverShip(targetShipId);
            // eslint-disable-next-line no-console
            console.error(
                'server state:',
                JSON.stringify({
                    signalsTargetId: ship?.signalsTargetId,
                    tubes: target ? [...target.tubes].map((t) => t.loadedProjectile) : null,
                }),
            );
            // what the page shows, to tell a stale client from a slow render
            const shown = await page
                .evaluate(() => ({
                    inputs: [...document.querySelectorAll('input')].map((i) => i.value),
                    panels: [...document.querySelectorAll('[data-id]')].map((e) => e.getAttribute('data-id')),
                }))
                .catch((e: unknown) => String(e));
            // eslint-disable-next-line no-console
            console.error('page shows:', JSON.stringify(shown));
            // main-thread health of every open tab: a 1 s window of timer drift and animation frames
            const health = await Promise.all(
                page
                    .context()
                    .pages()
                    .map((pg) =>
                        pg
                            .evaluate(
                                () =>
                                    new Promise<{ driftMs: number; frames: number }>((resolve) => {
                                        const t0 = performance.now();
                                        let frames = 0;
                                        const tick = () => {
                                            frames++;
                                            requestAnimationFrame(tick);
                                        };
                                        requestAnimationFrame(tick);
                                        setTimeout(
                                            () =>
                                                resolve({ driftMs: Math.round(performance.now() - t0 - 1000), frames }),
                                            1000,
                                        );
                                    }),
                            )
                            .catch(() => null),
                    ),
            );
            // eslint-disable-next-line no-console
            console.error('page health (1s window):', JSON.stringify(health));
            const visibility = await page.evaluate(() => document.visibilityState).catch(() => 'n/a');
            const started = Date.now();
            let lateByMs: number | string = 'never';
            while (Date.now() - started < 15000) {
                const track = await getPropertyValue(page, 'Track', 'Target').catch(() => undefined);
                if (track === targetShipId) {
                    lateByMs = Date.now() - started;
                    break;
                }
                await page.waitForTimeout(250);
            }
            // eslint-disable-next-line no-console
            console.error(
                'page timing:',
                JSON.stringify({
                    visibility,
                    lateByMs,
                    pages: page.context().pages().length,
                    serverSawTargetAfterMs: probe.contactAt && probe.serverAt ? probe.serverAt - probe.contactAt : null,
                }),
            );
        }
        clearInterval(probe.timer);
        probe.contactAt = probe.serverAt = undefined;
        await cleanupPageState(page);
    });

    test('follows the target marked on the Signals station', async ({ page, context }) => {
        await openTargetDetails(page);
        await expect(page.locator('[data-id="No Data"]')).toHaveText(/no target/i);

        const signals = await context.newPage();
        setupPageErrorHandlers(signals);
        await navigateToScreen(signals, `/signals.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
        await expect(signals.locator('[data-id="Long Range Radar"]')).toBeVisible({ timeout: 10000 });

        for (let i = 0; i < 5 && (await getPropertyValue(signals, 'Track', 'Contact')) !== targetShipId; i++) {
            await signals.keyboard.press(']');
        }
        expect(await getPropertyValue(signals, 'Track', 'Contact')).toBe(targetShipId);
        probe.contactAt = Date.now();
        probe.timer = setInterval(() => {
            if (!probe.serverAt && serverShip(shipId)?.signalsTargetId === targetShipId) {
                probe.serverAt = Date.now();
            }
        }, 50);
        await expect.poll(() => getPropertyValue(page, 'Track', 'Target'), { timeout: 5000 }).toBe(targetShipId);

        await signals.keyboard.press("'");
        await expect.poll(() => getPropertyValue(page, 'Track', 'Target'), { timeout: 5000 }).toBe('—');
        await expect(page.locator('[data-id="No Data"]')).toHaveText(/no target/i);
        await signals.close();
    });

    test('below full scan, shows no data and no target internals', async ({ page }) => {
        markSignalsTarget(targetShipId);
        setTargetScanLevel(ScanLevel.BASIC);
        await openTargetDetails(page);

        await expect.poll(() => getPropertyValue(page, 'Track', 'Target'), { timeout: 5000 }).toBe(targetShipId);
        await expect(page.locator('[data-id="No Data"]')).toHaveText(/no data/i);
        await expect(page.locator('[data-id="Armor"]')).toHaveCount(0);
        await expect(page.locator('[data-id="Target Tubes"]')).toHaveCount(0);
        await expect(page.locator('[data-id="Systems"]')).toHaveCount(0);
    });

    test('at snapshot level, shows no data', async ({ page }) => {
        markSignalsTarget(targetShipId);
        setTargetScanLevel(ScanLevel.SNAPSHOT);
        await openTargetDetails(page);

        await expect.poll(() => getPropertyValue(page, 'Scan level', 'Target'), { timeout: 5000 }).toBe('SNAPSHOT');
        await expect(page.locator('[data-id="No Data"]')).toHaveText(/no data/i);
        await expect(page.locator('[data-id="Armor"]')).toHaveCount(0);
    });

    test('at full scan, draws the target live armor, systems and tubes', async ({ page }) => {
        gameDriver.getShip(targetShipId).state.tubes[0].loadedProjectile = 'HiExpMissile';
        markSignalsTarget(targetShipId);
        setTargetScanLevel(ScanLevel.FULL);
        await openTargetDetails(page);

        await expect.poll(() => getPropertyValue(page, 'Intel', 'Target'), { timeout: 5000 }).toBe('LIVE');
        await expect(page.locator('[data-id="Armor"]')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('[data-id="Systems"]')).toBeVisible();
        await expect(page.locator('[data-id="No Data"]')).toBeHidden();
        const tubesPanel = page.locator('[data-id="Target Tubes"]');
        await expect(tubesPanel).toBeVisible();
        await expect(async () => expect(await inputValues(tubesPanel)).toContain('HiExpMissile')).toPass({
            timeout: 5000,
        });

        // fixed grid: header, armor, tubes and systems never overlap
        const boxes = await Promise.all(
            ['Target', 'Armor', 'Target Tubes', 'Systems'].map(async (id) => ({
                id,
                box: (await page.locator(`[data-id="${id}"]`).first().boundingBox())!,
            })),
        );
        for (const [i, { id: idA, box: a }] of boxes.entries()) {
            for (const { id: idB, box: b } of boxes.slice(i + 1)) {
                const overlaps =
                    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
                expect(overlaps, `${idA} overlaps ${idB}`).toBe(false);
            }
        }

        // live: a change on the target shows without re-selecting it
        gameDriver.getShip(targetShipId).state.tubes[0].loadedProjectile = 'None';
        await expect(async () => expect(await inputValues(tubesPanel)).toContain('None')).toPass({
            timeout: 5000,
        });

        // dropping below FULL removes the internals
        setTargetScanLevel(ScanLevel.BASIC);
        await expect(page.locator('[data-id="Armor"]')).toHaveCount(0, { timeout: 5000 });
        await expect(page.locator('[data-id="Target Tubes"]')).toHaveCount(0);
        await expect(page.locator('[data-id="No Data"]')).toHaveText(/no data/i);
    });

    test('is read-only: station hotkeys change nothing', async ({ page }) => {
        markSignalsTarget(targetShipId);
        setTargetScanLevel(ScanLevel.FULL);
        await openTargetDetails(page);
        await expect(page.locator('body')).toHaveAttribute('data-input', 'none');
        const ship = gameDriver.getShip(shipId).state;
        const before = { antiDrift: ship.antiDrift, breaks: ship.breaks, jobsPaused: ship.signals.jobsPaused };
        for (const key of [']', '[', "'", 'p', 'x', 'z', '=', '-', '1', 'q', 'Space']) {
            await page.keyboard.press(key);
        }
        await page.waitForTimeout(500);
        expect(ship.signalsTargetId).toBe(targetShipId);
        expect({ antiDrift: ship.antiDrift, breaks: ship.breaks, jobsPaused: ship.signals.jobsPaused }).toEqual(before);
    });
});

// Concealment display rule (SPEC-0008 §6): with the Signals target at FULL, no other station draws
// its internals. Helms and Engineer draw their own ship's armor, hence at most one Armor canvas.
test.describe('Target internals stay on Target Details', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(two_ships);
        markSignalsTarget(targetShipId);
        setTargetScanLevel(ScanLevel.FULL);
    });

    test.afterEach(async ({ page }, testInfo) => {
        clearInterval(probe.timer);
        if (testInfo.status !== testInfo.expectedStatus) {
            // bisects server vs client when the page never shows the expected target data
            const ship = serverShip(shipId);
            const target = serverShip(targetShipId);
            // eslint-disable-next-line no-console
            console.error(
                'server state:',
                JSON.stringify({
                    signalsTargetId: ship?.signalsTargetId,
                    tubes: target ? [...target.tubes].map((t) => t.loadedProjectile) : null,
                }),
            );
        }
        await cleanupPageState(page);
    });

    // Signals is covered by signals-target-info.spec.ts
    for (const station of ['helms', 'weapons', 'engineer', 'dradis']) {
        test(`${station} draws no target internals`, async ({ page }) => {
            await navigateToScreen(page, `/${station}.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
            await expect(page.locator('.tp-rotv[data-id]').first()).toBeVisible({ timeout: 10000 });
            // give a late-joining target room time to draw
            await page.waitForTimeout(1500);
            await expect(page.locator('[data-id="Target Tubes"]')).toHaveCount(0);
            expect(await page.locator('[data-id="Armor"]').count()).toBeLessThanOrEqual(1);
        });
    }
});
