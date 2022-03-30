import { expect, test } from '@playwright/test';

test('main page loads', async ({ page }) => {
    await page.goto(`/`);
    const title = page.locator('[data-id="title"]');
    await expect(title).toHaveText('Starwards');
});
