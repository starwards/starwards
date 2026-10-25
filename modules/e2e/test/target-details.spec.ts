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

// every Target Details panel beyond armor/systems/tubes (SPEC-0008 PR 3)
const remainingPanels = ['Magazine', 'Chain Gun', 'Aim', 'Reactor', 'Warp', 'Flight', 'Modes', 'Damage'];

// the Aim pane's Track (the header pane has a Track too, so read it by pane, not by label)
function aimTrack(page: Page) {
    return page.locator('[data-id="Aim"] input').first().inputValue();
}

async function expectRemainingPanels(page: Page) {
    for (const id of remainingPanels) {
        await expect(page.locator(`[data-id="${id}"]`).first(), id).toBeVisible({ timeout: 10000 });
    }
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
        await expect(page.locator('[data-id="Design"]')).toHaveCount(0);
        for (const id of remainingPanels) await expect(page.locator(`[data-id="${id}"]`), id).toHaveCount(0);
    });

    test('at snapshot level without a capture (GM-set), shows no data', async ({ page }) => {
        markSignalsTarget(targetShipId);
        setTargetScanLevel(ScanLevel.SNAPSHOT);
        await openTargetDetails(page);

        await expect.poll(() => getPropertyValue(page, 'Scan level', 'Target'), { timeout: 5000 }).toBe('SNAPSHOT');
        await page.waitForTimeout(1500); // a poll would have answered by now
        await expect(page.locator('[data-id="No Data"]')).toHaveText(/no data/i);
        await expect(page.locator('[data-id="Armor"]')).toHaveCount(0);
    });

    test('after FULL drops to SNAPSHOT, draws the frozen snapshot as LAST KNOWN', async ({ page }) => {
        const target = gameDriver.getShip(targetShipId);
        gameDriver.gameManager.spaceManager.state.getShip(targetShipId)!.faction = Faction.Raiders; // own faction never demotes
        target.state.tubes[0].loadedProjectile = 'HiExpMissile';
        markSignalsTarget(targetShipId);
        setTargetScanLevel(ScanLevel.FULL);
        await openTargetDetails(page);
        await expect.poll(() => getPropertyValue(page, 'Intel', 'Target'), { timeout: 5000 }).toBe('LIVE');

        // the scan beam's grace running out, by hand: the own ship's beam may still cover the target
        const { gameManager } = gameDriver;
        gameManager.spaceManager.factionIntel.update(gameManager.totalSeconds, 1, []);

        await expect.poll(() => getPropertyValue(page, 'Scan level', 'Target'), { timeout: 5000 }).toBe('SNAPSHOT');
        await expect
            .poll(() => getPropertyValue(page, 'Intel', 'Target'), { timeout: 5000 })
            .toMatch(/^LAST KNOWN · \d+s$/);
        await expect(page.locator('[data-id="Armor"]')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('[data-id="Systems"]')).toBeVisible();
        await expect(page.locator('[data-id="No Data"]')).toBeHidden();
        const tubesPanel = page.locator('[data-id="Target Tubes"]');
        await expect(async () => expect(await inputValues(tubesPanel)).toContain('HiExpMissile')).toPass({
            timeout: 5000,
        });
        const plates = target.state.armor.numberOfPlates;
        await expect
            .poll(() => getPropertyValue(page, 'Plates', 'Design'), { timeout: 5000 })
            .toBe(`${plates}/${plates} holding`);

        await expectRemainingPanels(page);
        await expect.poll(() => aimTrack(page), { timeout: 5000 }).toBe(target.state.weaponsTarget.targetId || '—');

        // frozen: a change on the target after capture does not show
        target.state.weaponsTarget.targetId = 'changed-after-capture';
        target.state.tubes[0].loadedProjectile = 'None';
        for (const layer of target.state.armor.armorPlates[0].layers) layer.health = 0;
        await page.waitForTimeout(1500);
        expect(await inputValues(tubesPanel)).toContain('HiExpMissile');
        expect(await inputValues(tubesPanel)).not.toContain('None');
        expect(await getPropertyValue(page, 'Plates', 'Design')).toBe(`${plates}/${plates} holding`);
        expect(await aimTrack(page)).not.toBe('changed-after-capture');
    });

    test('shows the target gun heat live at FULL and frozen as LAST KNOWN below it (M4.39)', async ({ page }) => {
        const target = gameDriver.getShip(targetShipId).state;
        gameDriver.gameManager.spaceManager.state.getShip(targetShipId)!.faction = Faction.Raiders; // own faction never demotes
        gameDriver.gameManager.state.speed = 0; // no cooling while the readout is compared
        target.chainGuns[0].heat = 20;
        markSignalsTarget(targetShipId);
        setTargetScanLevel(ScanLevel.FULL);
        await openTargetDetails(page);
        await expect.poll(() => getPropertyValue(page, 'Intel', 'Target'), { timeout: 5000 }).toBe('LIVE');
        const gunHeat = () => getPropertyValue(page, 'Heat', 'Chain Gun');
        await expect.poll(gunHeat, { timeout: 5000 }).toBe('20');

        target.chainGuns[0].heat = 40;
        await expect.poll(gunHeat, { timeout: 5000 }).toBe('40');

        const { gameManager } = gameDriver;
        gameManager.spaceManager.factionIntel.update(gameManager.totalSeconds, 1, []);
        await expect
            .poll(() => getPropertyValue(page, 'Intel', 'Target'), { timeout: 5000 })
            .toMatch(/^LAST KNOWN · \d+s$/);
        await expect.poll(gunHeat, { timeout: 5000 }).toBe('40');
        target.chainGuns[0].heat = 80;
        await page.waitForTimeout(1500);
        expect(await gunHeat()).toBe('40');
    });

    test('hides energy readouts for an NPC target and shows them for a player ship (M4.66)', async ({ page }) => {
        markSignalsTarget(targetShipId);
        setTargetScanLevel(ScanLevel.FULL);
        await openTargetDetails(page);
        const reactor = page.locator('[data-id="Reactor"]');
        const energyLabel = reactor.getByText('energy', { exact: true });
        const epmHeader = page.locator('[data-id="Systems"]').getByText('EPM', { exact: true });
        await expect(reactor).toBeVisible({ timeout: 10000 });
        await expect(energyLabel).toBeVisible();
        await expect(epmHeader).toBeVisible();

        gameDriver.getShip(targetShipId).state.isPlayerShip = false;
        // the panels are rebuilt when the subject changes: drop the mark and re-mark it
        markSignalsTarget('');
        await expect(page.locator('[data-id="Reactor"]')).toHaveCount(0, { timeout: 5000 });
        markSignalsTarget(targetShipId);
        await expect(reactor).toBeVisible({ timeout: 10000 });
        await expect(reactor.getByText('afterburner fuel')).toBeVisible();
        await expect(energyLabel).toHaveCount(0);
        await expect(reactor.getByText('cells')).toHaveCount(0);
        await expect(epmHeader).toHaveCount(0);
        await expect(page.locator('[data-id="Systems"]')).toBeVisible();
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
        const target = gameDriver.getShip(targetShipId).state;
        await expect
            .poll(() => getPropertyValue(page, 'Hull', 'Design'), { timeout: 5000 })
            .toBe(target.design.modelName);
        const tubesPanel = page.locator('[data-id="Target Tubes"]');
        await expect(tubesPanel).toBeVisible();
        await expect(async () => expect(await inputValues(tubesPanel)).toContain('HiExpMissile')).toPass({
            timeout: 5000,
        });

        // fixed grid: header, armor, tubes and systems never overlap
        const boxes = await Promise.all(
            ['Target', 'Design', 'Armor', 'Target Tubes', 'Systems'].map(async (id) => ({
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

        await expectRemainingPanels(page);

        // live: a change on the target shows without re-selecting it
        target.weaponsTarget.targetId = shipId;
        await expect.poll(() => aimTrack(page), { timeout: 5000 }).toBe(shipId);
        gameDriver.getShip(targetShipId).state.tubes[0].loadedProjectile = 'None';
        await expect(async () => expect(await inputValues(tubesPanel)).toContain('None')).toPass({
            timeout: 5000,
        });
        const plates = target.armor.numberOfPlates;
        for (const layer of target.armor.armorPlates[0].layers) layer.health = 0;
        await expect
            .poll(() => getPropertyValue(page, 'Plates', 'Design'), { timeout: 5000 })
            .toBe(`${plates - 1}/${plates} holding`);

        // dropping below FULL removes the internals
        setTargetScanLevel(ScanLevel.BASIC);
        await expect(page.locator('[data-id="Armor"]')).toHaveCount(0, { timeout: 5000 });
        await expect(page.locator('[data-id="Target Tubes"]')).toHaveCount(0);
        await expect(page.locator('[data-id="Design"]')).toHaveCount(0);
        for (const id of remainingPanels) await expect(page.locator(`[data-id="${id}"]`), id).toHaveCount(0);
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
