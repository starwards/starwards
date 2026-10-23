import { Page, expect, test } from '@playwright/test';

import { makeDriver } from './driver';
import { maps } from '@starwards/server';
import { navigateToScreen } from './test-infrastructure';

const gameDriver = makeDriver(test);
const { single_ship } = maps;

/** Every game records from its start: lets that recording run a couple of frames past frame 0, then stops it. */
async function recordStartedGame(page: Page) {
    await expect.poll(() => gameDriver.gameManager.state.recordingName, { timeout: 5000 }).not.toBe('');
    const name = gameDriver.gameManager.state.recordingName;
    await page.waitForTimeout(2500);
    expect((await page.request.post(`${gameDriver.baseURL}/stop-recording`, { data: {} })).ok()).toBe(true);
    return name;
}

test('a recorded game opens from the lobby in the recording player, with no game running', async ({ page }) => {
    await gameDriver.gameManager.startGame(single_ship);
    await recordStartedGame(page);
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
    const name = await recordStartedGame(page);
    await page.request.post(`${gameDriver.baseURL}/stop-game`);
    const content = await (await page.request.get(`${gameDriver.baseURL}/recordings/${name}`)).body();

    await page.goto(`${gameDriver.baseURL}/`);
    await expect(page.locator('[data-id="title"]')).toBeVisible();
    await page.evaluate(
        ({ fileName, bytes }) => {
            const data = new DataTransfer();
            data.items.add(new File([new Uint8Array(bytes)], fileName));
            for (const type of ['dragover', 'drop']) {
                window.dispatchEvent(new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }));
            }
        },
        { fileName: name, bytes: [...content] },
    );

    await expect(page).toHaveURL(/player\.html\?handoff/);
    await expect(page.locator('[data-id="time"]')).toContainText('/');
    await expect(page.locator('[data-id="recording title"]')).toContainText(name);
});

async function dropFile(page: Page, fileName: string, content: string | Buffer) {
    await page.evaluate(
        ({ fileName: name, bytes }) => {
            const data = new DataTransfer();
            data.items.add(new File([new Uint8Array(bytes)], name));
            for (const type of ['dragover', 'drop']) {
                window.dispatchEvent(new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }));
            }
        },
        { fileName, bytes: [...Buffer.from(content)] },
    );
}

test('a saved game file dropped on the lobby is loaded', async ({ page }) => {
    await gameDriver.gameManager.startGame(single_ship);
    const saved = await (await page.request.post(`${gameDriver.baseURL}/save-game`, { data: {} })).text();
    await page.request.post(`${gameDriver.baseURL}/stop-game`);

    await page.goto(`${gameDriver.baseURL}/?lobby`);
    await expect(page.locator('[data-id="new game"]')).toBeVisible();
    await dropFile(page, 'game.ssg', saved);

    await expect(page.locator('[data-id="stop game"]').first()).toBeVisible({ timeout: 10000 });
    expect(gameDriver.gameManager.state.isGameRunning).toBe(true);
});

test('a saved game dropped on the lobby while a game is running is refused', async ({ page }) => {
    await gameDriver.gameManager.startGame(single_ship);
    const saved = await (await page.request.post(`${gameDriver.baseURL}/save-game`, { data: {} })).text();

    await page.goto(`${gameDriver.baseURL}/?lobby`);
    await expect(page.locator('[data-id="stop game"]').first()).toBeVisible();
    await dropFile(page, 'game.ssg', saved);

    await expect(page.locator('[data-id="drop notice"]')).toContainText('Stop the running game');
});

test('the GM screen loads a dropped saved game and plays a dropped recording', async ({ page }) => {
    await gameDriver.gameManager.startGame(single_ship);
    const saved = await (await page.request.post(`${gameDriver.baseURL}/save-game`, { data: {} })).text();
    const name = await recordStartedGame(page);
    const recording = await (await page.request.get(`${gameDriver.baseURL}/recordings/${name}`)).body();
    await page.request.post(`${gameDriver.baseURL}/stop-game`);

    await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });
    await expect(page.locator('[data-id="Game Setup"]')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('or drop the file anywhere on this page')).toBeVisible();
    await dropFile(page, 'game.ssg', saved);
    await expect(() => {
        expect(gameDriver.gameManager.state.isGameRunning).toBe(true);
    }).toPass({ timeout: 10000 });

    await dropFile(page, 'game.ssg', saved);
    await expect(page.locator('[data-id="drop notice"]')).toContainText('Stop the running game');

    await dropFile(page, name, recording);
    await expect(page).toHaveURL(/player\.html\?handoff/);
    await expect(page.locator('[data-id="time"]')).toContainText('/');
});

test('the lobby Load button takes a saved game or a recording, like a drop', async ({ page }) => {
    await gameDriver.gameManager.startGame(single_ship);
    const saved = await (await page.request.post(`${gameDriver.baseURL}/save-game`, { data: {} })).text();
    const name = await recordStartedGame(page);
    const recording = await (await page.request.get(`${gameDriver.baseURL}/recordings/${name}`)).body();
    await page.request.post(`${gameDriver.baseURL}/stop-game`);

    await page.goto(`${gameDriver.baseURL}/?lobby`);
    await expect(page.locator('[data-id="new game"]')).toBeVisible();
    await expect(page.locator('[data-id="load"]')).toBeVisible();
    await page.locator('[data-id="load file input"]').setInputFiles({
        name: 'game.ssg',
        mimeType: 'application/octet-stream',
        buffer: Buffer.from(saved),
    });
    await expect(page.locator('[data-id="stop game"]').first()).toBeVisible({ timeout: 10000 });
    expect(gameDriver.gameManager.state.isGameRunning).toBe(true);

    // a recording can be loaded while the game runs; a second saved game cannot
    await page.locator('[data-id="load file input"]').setInputFiles({
        name: 'again.ssg',
        mimeType: 'application/octet-stream',
        buffer: Buffer.from(saved),
    });
    await expect(page.locator('[data-id="drop notice"]')).toContainText('Stop the running game');
    await page.locator('[data-id="load file input"]').setInputFiles({
        name,
        mimeType: 'application/octet-stream',
        buffer: recording,
    });
    await expect(page).toHaveURL(/player\.html\?handoff/);
    await expect(page.locator('[data-id="time"]')).toContainText('/');
});
