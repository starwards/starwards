import { Page, expect, test } from '@playwright/test';
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';

import { makeDriver } from './driver';
import { maps } from '@starwards/server';

const { single_ship } = maps;
const gameDriver = makeDriver(test);

/**
 * Drags the transport widget out of the GM's widget menu and into the layout, the way a GM
 * places any other widget. A widget that throws while being constructed leaves golden-layout
 * with nothing to drop, so this doubles as the regression test for that.
 */
async function dragTransportIntoLayout(page: Page) {
    const menuItem = page.locator('[data-id="menu-transport"]');
    await expect(menuItem).toBeVisible({ timeout: 15000 });
    const box = await page.locator('#layoutContainer').boundingBox();
    if (!box) throw new Error('layout container has no bounding box');
    await menuItem.hover();
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 });
    await page.mouse.up();
    return page.locator('[data-id="Transport"]');
}

test.describe('GM transport widget', () => {
    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('drops into the GM layout and drives a live game with rate controls only', async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });

        const transport = await dragTransportIntoLayout(page);
        await expect(transport).toBeVisible({ timeout: 10000 });

        // replay-only controls are absent in a live game — there is nothing to seek through
        await expect(transport.getByText('position', { exact: true })).toBeHidden();
        await expect(transport.getByText('scrub', { exact: true })).toBeHidden();

        await transport.locator('button.tp-btnv_b', { hasText: 'pause' }).click();
        await expect(() => {
            expect(gameDriver.gameManager.state.speed).toBe(0);
        }).toPass({ timeout: 5000 });

        await transport.locator('button.tp-btnv_b', { hasText: 'fast' }).click();
        await expect(() => {
            expect(gameDriver.gameManager.state.speed).toBeGreaterThan(1);
        }).toPass({ timeout: 5000 });
    });

    test('exposes replay position and scrubbing while a replay is playing', async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
        await page.request.post(`${gameDriver.baseURL}/start-recording`);
        await page.waitForTimeout(2500); // a couple of frames past frame 0
        await page.request.post(`${gameDriver.baseURL}/stop-recording`);
        await page.request.post(`${gameDriver.baseURL}/stop-game`);
        const recordings = (await (await page.request.get(`${gameDriver.baseURL}/recordings`)).json()) as Array<{
            name: string;
        }>;
        await page.request.post(`${gameDriver.baseURL}/start-replay`, { data: { name: recordings[0].name } });

        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });
        const transport = await dragTransportIntoLayout(page);
        await expect(transport).toBeVisible({ timeout: 10000 });

        await expect(transport.getByText('position', { exact: true })).toBeVisible();
        await expect(transport.getByText('scrub', { exact: true })).toBeVisible();
    });
});
