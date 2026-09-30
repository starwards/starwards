import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';

import { HackLevel } from '@starwards/core';
import { makeDriver } from './driver';
import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

const WARNING = 'rgb(255, 59, 48)';
const CAUTION = 'rgb(255, 176, 0)';

test.describe('Readout skin', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('status cells light up amber/red and return to dark', async ({ page }) => {
        await navigateToScreen(page, `/weapons.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
        const panel = page.locator('[data-id="Systems"]');
        await expect(panel).toBeVisible({ timeout: 10000 });
        const background = (status: string) =>
            panel
                .locator(`[data-status="${status}"]`)
                .first()
                .evaluate((el) => getComputedStyle(el).backgroundColor);
        const gun = gameDriver.getShip(shipId).state.chainGuns.at(0);

        gun.hacked = HackLevel.DISABLED;
        await expect(panel.locator('[data-status="ERROR"]').first()).toBeAttached({ timeout: 5000 });
        expect(await background('ERROR')).toBe(WARNING);

        gun.hacked = HackLevel.COMPROMISED;
        await expect(panel.locator('[data-status="ERROR"]')).toHaveCount(0, { timeout: 5000 });
        await expect(panel.locator('[data-status="WARN"]').first()).toBeAttached({ timeout: 5000 });
        expect(await background('WARN')).toBe(CAUTION);

        gun.hacked = HackLevel.OK;
        await expect(panel.locator('[data-status="WARN"]')).toHaveCount(0, { timeout: 5000 });
        const okBackground = await background('OK');
        expect(okBackground).toBe('rgb(3, 8, 11)');
    });

    test('an over-long repair-queue value is truncated inside its row', async ({ page }) => {
        await navigateToScreen(page, `/engineer.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
        const panel = page.locator('[data-id="Repair Queue"]');
        await expect(panel).toBeVisible({ timeout: 10000 });
        const ship = gameDriver.getShip(shipId);
        await page.keyboard.press('Alt+1'); // actuatorRecalibration
        const slot = () => ship.state.repairQueue.slots.find((s) => s.protocolId === 'actuatorRecalibration')!;
        await expect.poll(() => slot().priority, { timeout: 5000 }).toBe(4);
        ship.state.reactor.effeciencyFactor = 0;
        ship.state.reactor.energy = 0;
        await expect.poll(() => slot().energyStarved, { timeout: 1500 }).toBe(true);

        const row = panel.locator('.tp-fldv', { hasText: 'Actuator recalibration' }).first();
        const label = row.getByText('repair energy', { exact: true });
        const input = label.locator('..').locator('input');
        await expect(input).toHaveValue('insufficient reactor energy');
        const metrics = await input.evaluate((el) => {
            const box = el.getBoundingClientRect();
            const rowBox = el.closest('.tp-lblv')!.getBoundingClientRect();
            return {
                truncated: el.scrollWidth > el.clientWidth,
                overflow: getComputedStyle(el).textOverflow,
                inside: box.left >= rowBox.left - 1 && box.right <= rowBox.right + 1,
            };
        });
        expect(metrics).toEqual({ truncated: true, overflow: 'ellipsis', inside: true });
    });

    test('dradis keeps working inputs and checkboxes', async ({ page }) => {
        await navigateToScreen(page, `/dradis.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
        const waypoint = page.locator('[data-id="New Waypoint"]');
        await expect(waypoint).toBeVisible({ timeout: 10000 });
        const group = waypoint.locator('input[type="text"]').first();
        await group.fill('route-7');
        await expect(group).toHaveValue('route-7');

        const layers = page.locator('[data-id="Layers"]');
        await expect(layers).toBeVisible();
        const box = layers.locator('.tp-ckbv_w').first();
        const input = layers.locator('input[type="checkbox"]').first();
        const before = await input.isChecked();
        await box.click();
        expect(await input.isChecked()).toBe(!before);
    });

    test('pane ids render in the title bar and segmented bars keep a solid fill', async ({ page }) => {
        await navigateToScreen(page, `/weapons.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
        const tubes = page.locator('[data-id="Tubes"]');
        await expect(tubes).toBeVisible({ timeout: 10000 });
        const paneId = await tubes.locator('> .tp-rotv_b').evaluate((el) => getComputedStyle(el, '::after').content);
        expect(paneId).toBe('"WPN-02"');
        const systems = page.locator('[data-id="Systems"] > .tp-rotv_b');
        expect(await systems.evaluate((el) => getComputedStyle(el, '::after').content)).toBe('"WPN-06"');

        const segmented = tubes.locator('[data-segmented]').first();
        await expect(segmented).toBeAttached();
        const styles = await segmented.evaluate((el) => {
            const fill = getComputedStyle(el.querySelector('.tp-sldv_k')!, '::before');
            const track = getComputedStyle(el.querySelector('.tp-sldv_t')!);
            return {
                fillMask: fill.maskImage || fill.webkitMaskImage || 'none',
                trackBackground: track.backgroundImage,
            };
        });
        expect(styles.fillMask).toBe('none');
        expect(styles.trackBackground).toContain('repeating-linear-gradient');
    });

    test('an annunciator on an interactive screen still toggles its writable state', async ({ page }) => {
        await page.setViewportSize({ width: 1600, height: 900 });
        await navigateToScreen(page, `/ship.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
        await page
            .getByText('tubes', { exact: true })
            .dragTo(page.locator('body'), { targetPosition: { x: 900, y: 300 } });
        const safe = page.locator('[data-id="Tubes"] .sw-ann[data-tone="caution"]').first();
        await expect(safe).toBeVisible({ timeout: 10000 });
        const tube = () => gameDriver.getShip(shipId).state.tubes.at(0);
        expect(tube().safetyLocked).toBe(true);
        await safe.click();
        await expect.poll(() => tube().safetyLocked, { timeout: 4000 }).toBe(false);
    });

    test('helms panes carry their ids in the title bar', async ({ page }) => {
        await navigateToScreen(page, `/helms.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
        for (const [title, id] of [
            ['Flight', 'HLM-01'],
            ['Modes', 'HLM-02'],
            ['Command', 'HLM-03'],
            ['Fuel', 'HLM-04'],
        ]) {
            const bar = page.locator(`[data-id="${title}"] > .tp-rotv_b`);
            await expect(bar).toBeVisible({ timeout: 10000 });
            expect(await bar.evaluate((el) => getComputedStyle(el, '::after').content)).toBe(`"${id}"`);
        }
    });

    test('a signed command bar fills from its centre tick toward the value', async ({ page }) => {
        test.slow(); // the fill follows a server patch: seconds of latency when CI workers starve each other
        await navigateToScreen(page, `/helms.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
        const row = page.locator('[data-id="Command"] [data-bipolar]').filter({ hasText: 'strafe' });
        await expect(row).toBeVisible({ timeout: 10000 });
        const fillEdges = () =>
            row.locator('.tp-sldv_t').evaluate((track) => {
                const fill = getComputedStyle(track, '::before');
                const half = track.clientWidth / 2;
                return {
                    left: (parseFloat(fill.left) - half) / half,
                    right: (parseFloat(fill.left) + parseFloat(fill.width) - half) / half,
                    tick: parseFloat(getComputedStyle(track, '::after').left) / track.clientWidth,
                };
            });
        const ship = gameDriver.getShip(shipId);

        ship.state.smartPilot.maneuvering.y = 0.5;
        await expect.poll(async () => (await fillEdges()).right, { timeout: 20000 }).toBeCloseTo(0.5, 1);
        const positive = await fillEdges();
        expect(positive.left).toBeCloseTo(0, 1);
        expect(positive.tick).toBeCloseTo(0.5, 1);

        ship.state.smartPilot.maneuvering.y = -0.5;
        await expect.poll(async () => (await fillEdges()).left, { timeout: 20000 }).toBeCloseTo(-0.5, 1);
        expect((await fillEdges()).right).toBeCloseTo(0, 1);
    });

    test('a level bar on a display station spans its pane', async ({ page }) => {
        await navigateToScreen(page, `/helms.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
        const fuel = page.locator('[data-id="Fuel"]');
        await expect(fuel).toBeVisible({ timeout: 10000 });
        const widths = await fuel.evaluate((pane) => {
            const content = pane.querySelector('.tp-rotv_c')!;
            const style = getComputedStyle(content);
            const inner = content.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
            return {
                inner,
                bars: [...pane.querySelectorAll('.tp-sldv_t')].map((el) => el.getBoundingClientRect().width),
            };
        });
        expect(widths.bars).toHaveLength(2);
        for (const bar of widths.bars) {
            expect(bar).toBeGreaterThanOrEqual(widths.inner * 0.8);
        }
    });
});
