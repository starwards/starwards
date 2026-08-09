import { expect, test } from '@playwright/test';

import { makeDriver } from './driver';
import { maps } from '@starwards/server';
import { navigateToScreen } from './test-infrastructure';

const gameDriver = makeDriver(test);
const { single_ship } = maps;

test('record a game session and replay it from the lobby, with stations reachable', async ({ page }) => {
    await page.goto(`${gameDriver.baseURL}/`);
    const newGame = page.locator('[data-id="new game"]').first();
    await newGame.click({ delay: 200 });
    await newGame.waitFor({ state: 'detached' });

    // recording is driven from the GM screen; the lobby only reports that one is running
    await page.request.post(`${gameDriver.baseURL}/start-recording`);
    await expect(page.locator('[data-id="recording-note"]')).toBeVisible();
    await page.waitForTimeout(1200); // at least one frame past frame 0
    await page.request.post(`${gameDriver.baseURL}/stop-recording`);
    await expect(page.locator('[data-id="recording-note"]')).toBeHidden();

    await page.locator('[data-id="stop game"]').first().click({ delay: 200 });
    await newGame.waitFor({ state: 'visible' });

    const replayButton = page.locator('[data-id^="replay "]').first();
    await expect(replayButton).toBeVisible();
    await replayButton.click({ delay: 200 });

    await expect(page.locator('[data-id="replaying-note"]')).toBeVisible();
    // a replay is watched from the bridge, so the station links stay on offer
    await expect(page.getByText('Weapons').first()).toBeVisible({ timeout: 10000 });

    await page.locator('[data-id="stop replay"]').click({ delay: 200 });
    await newGame.waitFor({ state: 'visible' });
});

test('a station watching a replay shows the observation chip, and drops it when the replay ends', async ({ page }) => {
    const shipId = single_ship.testShipId;
    await gameDriver.gameManager.startGame(single_ship);

    await page.request.post(`${gameDriver.baseURL}/start-recording`);
    await page.waitForTimeout(1200); // at least one frame past frame 0
    await page.request.post(`${gameDriver.baseURL}/stop-recording`);
    await page.request.post(`${gameDriver.baseURL}/stop-game`);

    const recordings = (await (await page.request.get(`${gameDriver.baseURL}/recordings`)).json()) as Array<{
        name: string;
    }>;
    await page.request.post(`${gameDriver.baseURL}/start-replay`, { data: { name: recordings[0].name } });

    await navigateToScreen(page, `/weapons.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
    const chip = page.locator('[data-id="observation-mode"]');
    await expect(chip).toBeVisible({ timeout: 10000 });
    await expect(chip).toContainText('REPLAY');
    await expect(chip).toContainText('OBSERVATION');

    await page.request.post(`${gameDriver.baseURL}/stop-game`);
    await expect(chip).toBeHidden();
});
