import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';

import { makeDriver } from './driver';
import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

const pane = '.tp-rotv';
const pointerEvents = (page: import('@playwright/test').Page) =>
    page
        .locator(pane)
        .first()
        .evaluate((el) => getComputedStyle(el).pointerEvents);

test.describe('Station input mode', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    for (const station of ['helms', 'weapons', 'engineer', 'signals']) {
        test(`${station} is display-only`, async ({ page }) => {
            await navigateToScreen(page, `/${station}.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
            await expect(page.locator(pane).first()).toBeVisible({ timeout: 10000 });
            await expect(page.locator('body')).toHaveAttribute('data-input', 'none');
            expect(await pointerEvents(page)).toBe('none');
        });
    }

    test('dradis keeps pointer input', async ({ page }) => {
        await navigateToScreen(page, `/dradis.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
        await expect(page.locator(pane).first()).toBeVisible({ timeout: 10000 });
        await expect(page.locator('body')).not.toHaveAttribute('data-input', /.*/);
        expect(await pointerEvents(page)).not.toBe('none');
    });

    test('gm keeps pointer input and compact density', async ({ page }) => {
        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });
        await expect(page.locator(pane).first()).toBeVisible({ timeout: 10000 });
        await expect(page.locator('body')).not.toHaveAttribute('data-input', /.*/);
        await expect(page.locator('body')).toHaveAttribute('data-density', 'compact');
        expect(await pointerEvents(page)).not.toBe('none');
    });

    test('weapons loads no remote fonts', async ({ page }) => {
        const remote: string[] = [];
        page.on('request', (r) => {
            if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) remote.push(r.url());
        });
        await navigateToScreen(page, `/weapons.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
        await expect(page.locator(pane).first()).toBeVisible({ timeout: 10000 });
        expect(remote).toEqual([]);
    });
});
