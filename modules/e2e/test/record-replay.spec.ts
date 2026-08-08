import { expect, test } from '@playwright/test';

import { makeDriver } from './driver';

const gameDriver = makeDriver(test);

test('record a game session and replay it from the lobby', async ({ page }) => {
    await page.goto(`${gameDriver.baseURL}/`);
    const newGame = page.locator('[data-id="new game"]').first();
    await newGame.click({ delay: 200 });
    await newGame.waitFor({ state: 'detached' });

    const recordButton = page.locator('[data-id="toggle recording"]').first();
    await recordButton.click({ delay: 200 });
    await expect(recordButton).toHaveText('Stop Recording');

    await recordButton.click({ delay: 200 });
    await expect(recordButton).toHaveText('Record');

    await page.locator('[data-id="stop game"]').first().click({ delay: 200 });
    await newGame.waitFor({ state: 'visible' });

    const replayButton = page.locator('[data-id^="replay "]').first();
    await expect(replayButton).toBeVisible();
    await replayButton.click({ delay: 200 });

    await expect(page.locator('[data-id="replaying-note"]')).toBeVisible();

    await page.locator('[data-id="stop replay"]').click({ delay: 200 });
    await newGame.waitFor({ state: 'visible' });
});
