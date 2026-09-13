import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';

import { makeDriver } from './driver';
import { maps } from '@starwards/server';

const { two_vs_one } = maps;
const gameDriver = makeDriver(test);

// Issue #2242: static/styles/index.css sets `#wrapper { overflow: hidden }`, clipping the lobby's
// stacked cards below the fold on a narrow viewport — only the Game Master card was reachable.
test.describe('Lobby mobile scroll', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await page.setViewportSize({ width: 390, height: 700 });
        await gameDriver.gameManager.startGame(two_vs_one);
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
        await gameDriver.gameManager.stopGame();
    });

    test('ship cards scroll into view on a narrow viewport', async ({ page }) => {
        await navigateToScreen(page, '/?lobby', { baseURL: gameDriver.baseURL });

        const gmCard = page.getByRole('button', { name: 'Game Master' });
        await expect(gmCard).toBeVisible({ timeout: 10000 });

        const footer = page.locator('[data-id="footer"]');
        await expect(footer).toHaveCount(1);
        await footer.scrollIntoViewIfNeeded();
        await expect(footer).toBeInViewport();
    });
});
