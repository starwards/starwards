import { expect, test } from '@playwright/test';

import { makeDriver } from './driver';

const gameDriver = makeDriver(test);

test('lobby renders one QR code per network address', async ({ page }) => {
    await page.route('**/network-info', (route) =>
        route.fulfill({
            json: {
                port: 8080,
                addresses: [
                    { address: '192.168.1.7', url: 'http://192.168.1.7:8080' },
                    { address: '10.0.0.5', url: 'http://10.0.0.5:8080' },
                ],
            },
        }),
    );
    await page.goto(`${gameDriver.baseURL}/`);

    const qrCodes = page.locator('[data-id="network-info-qr"]');
    await expect(qrCodes).toHaveCount(2);
    await expect(page.locator('[data-id="network-info-url"]', { hasText: '192.168.1.7:8080' })).toBeVisible();
    await expect(page.locator('[data-id="network-info-url"]', { hasText: '10.0.0.5:8080' })).toBeVisible();
});
