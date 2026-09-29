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
        const panel = page.locator('[data-id="Systems Status"]');
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

    test('pane ids render in the title bar and segmented bars are masked', async ({ page }) => {
        await navigateToScreen(page, `/weapons.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
        const tubes = page.locator('[data-id="Tubes Status"]');
        await expect(tubes).toBeVisible({ timeout: 10000 });
        const paneId = await tubes.locator('> .tp-rotv_b').evaluate((el) => getComputedStyle(el, '::after').content);
        expect(paneId).toBe('"WPN-02"');
        const systems = page.locator('[data-id="Systems Status"] > .tp-rotv_b');
        expect(await systems.evaluate((el) => getComputedStyle(el, '::after').content)).toBe('"WPN-06"');

        const fill = tubes.locator('[data-segmented] .tp-sldv_k').first();
        await expect(fill).toBeAttached();
        const mask = await fill.evaluate((el) => {
            const style = getComputedStyle(el, '::before');
            return style.maskImage || style.webkitMaskImage;
        });
        expect(mask).toContain('repeating-linear-gradient');
    });
});
