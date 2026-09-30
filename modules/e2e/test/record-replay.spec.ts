import { expect, test } from '@playwright/test';

import { makeDriver } from './driver';
import { maps } from '@starwards/server';

const gameDriver = makeDriver(test);
const { single_ship } = maps;

test('a recorded game opens from the lobby in the recording player, with no game running', async ({ page }) => {
    await gameDriver.gameManager.startGame(single_ship);
    await page.request.post(`${gameDriver.baseURL}/start-recording`);
    await page.waitForTimeout(2500); // a couple of frames past frame 0
    await page.request.post(`${gameDriver.baseURL}/stop-recording`);
    await page.request.post(`${gameDriver.baseURL}/stop-game`);

    await page.goto(`${gameDriver.baseURL}/`);
    const recording = page.locator('[data-id^="recording "]').first();
    await expect(recording).toBeVisible();
    await recording.click({ delay: 200 });

    await expect(page).toHaveURL(/player\.html\?src=/);
    await expect(page.locator('[data-id="time"]')).toContainText('/');
    await expect(page.locator('[data-id="GM Radar"]')).toBeVisible();
    await expect(page.locator('#menuContainer')).toContainText(`${single_ship.testShipId} helm`);
});

test('a recording file dropped on the lobby plays in the recording player', async ({ page }) => {
    await gameDriver.gameManager.startGame(single_ship);
    const { name } = (await (await page.request.post(`${gameDriver.baseURL}/start-recording`)).json()) as {
        name: string;
    };
    await page.waitForTimeout(2500); // a couple of frames past frame 0
    await page.request.post(`${gameDriver.baseURL}/stop-recording`);
    await page.request.post(`${gameDriver.baseURL}/stop-game`);
    const content = await (await page.request.get(`${gameDriver.baseURL}/recordings/${name}`)).text();

    await page.goto(`${gameDriver.baseURL}/`);
    await expect(page.locator('[data-id="title"]')).toBeVisible();
    await page.evaluate(
        ({ fileName, text }) => {
            const data = new DataTransfer();
            data.items.add(new File([text], fileName));
            for (const type of ['dragover', 'drop']) {
                window.dispatchEvent(new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }));
            }
        },
        { fileName: name, text: content },
    );

    await expect(page).toHaveURL(/player\.html\?handoff/);
    await expect(page.locator('[data-id="time"]')).toContainText('/');
    await expect(page.locator('[data-id="recording title"]')).toContainText(name);
});
