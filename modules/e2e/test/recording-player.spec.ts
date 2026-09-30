import { SavedGame, demoShip, makeShipState } from '@starwards/core';
import { expect, test } from '@playwright/test';
import { makeDriver } from './driver';
import { navigateToScreen } from './test-infrastructure';
import { schemaToString } from '@starwards/server';

const gameDriver = makeDriver(test);

async function frameLine(t: number, shipX: number) {
    const game = new SavedGame();
    game.mapName = 'player-test';
    const ship = makeShipState('ship-1', demoShip);
    ship.spaceship.position.x = shipX;
    ship.spaceship.angle = shipX / 100;
    game.fragment.ship.set('ship-1', ship);
    game.fragment.space.set(ship.spaceship);
    const frame = await schemaToString(game);
    return JSON.stringify({ t, frame });
}

const header = JSON.stringify({
    format: 'starwards-recording',
    version: 1,
    mapName: 'player-test',
    startedAt: '2026-01-01T00:00:00.000Z',
    intervalMs: 1000,
});
test('plays a recording read-only, with the timeline as the primary control', async ({ page }) => {
    const lines = await Promise.all([frameLine(0, 0), frameLine(1, 1000), frameLine(2, 2000), frameLine(3, 3000)]);
    const recording = [header, ...lines].join('\n');
    const serverRequests: string[] = [];
    page.on('request', (r) => {
        const { pathname, origin } = new URL(r.url());
        if (
            r.url().startsWith(gameDriver.baseURL) &&
            !/\.(js|css|html|png|jpg|svg|woff2?|ttf|otf|ico)$/.test(pathname)
        ) {
            serverRequests.push(`${r.method()} ${origin}${pathname}`);
        }
    });
    await navigateToScreen(page, '/player.html', { baseURL: gameDriver.baseURL });

    await page.locator('[data-id="file input"]').setInputFiles({
        name: 'test.sgr',
        mimeType: 'application/x-ndjson',
        buffer: Buffer.from(recording),
    });

    const time = page.locator('[data-id="time"]');
    const scrubber = page.locator('[data-id="scrubber"]');
    await expect(time).toHaveText('00:00 / 00:03');
    await expect(page.locator('[data-id="GM Radar"]')).toBeVisible();

    // the ship sits at the camera center at t=0: clicking there selects it
    await page.locator('[data-id="GM Radar"]').click({ delay: 100 });
    await expect(page.getByText('Spaceship Selected')).toBeVisible();

    // the real GM per-ship widgets are offered for the recorded ship
    await expect(page.locator('#menuContainer')).toContainText('ship-1 helm');

    // seeking with the scrubber moves the timeline and shows that frame's state
    await scrubber.evaluate((input: HTMLInputElement) => {
        input.value = '2';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(time).toHaveText('00:02 / 00:03');
    // the tweak panel is the real GM one: it follows the recorded state through real room events
    await expect(
        page
            .locator('.tp-lblv', { hasText: /^angle/ })
            .locator('input')
            .first(),
    ).toHaveValue(/^20/);

    // playing advances the position, and pausing stops it
    await page.locator('[data-id="play"]').click();
    await expect(time).toHaveText('00:03 / 00:03');
    await page.locator('[data-id="step back"]').click();
    await expect(time).toHaveText('00:02 / 00:03');
    await page.keyboard.press('Home');
    await expect(time).toHaveText('00:00 / 00:03');

    // nothing was ever sent to the game server
    expect(serverRequests).toEqual([]);
});
