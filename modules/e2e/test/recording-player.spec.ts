import { SavedGame, SpaceState, demoShip, encodeSegment, makeShipState, recordingSchemaHash } from '@starwards/core';
import { expect, test } from '@playwright/test';
import { Encoder } from '@colyseus/schema';
import { gzipSync } from 'node:zlib';
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

/** a format-v2 file: keyframes at 0, 1, 2 s; the first second has a delta state at 0.5 s, the second a corrupt segment */
async function v2Recording() {
    const keyframe = (angle: number) => {
        const game = new SavedGame();
        game.mapName = 'player-test';
        const ship = makeShipState('ship-1', demoShip);
        ship.spaceship.angle = angle;
        game.fragment.ship.set('ship-1', ship);
        game.fragment.space.set(ship.spaceship);
        return game;
    };
    const frame = async (t: number, angle: number) =>
        JSON.stringify({ t, frame: await schemaToString(keyframe(angle)) });
    const gz64 = (bytes: Uint8Array) => gzipSync(bytes).toString('base64');
    // the space room as it would record: a full-state base, then a patch half a second later
    const space = new SpaceState();
    const ship = makeShipState('ship-1', demoShip).spaceship;
    space.set(ship);
    const encoder = new Encoder(space);
    const base = new Uint8Array(encoder.encodeAll());
    encoder.discardChanges();
    ship.angle = 42; // off the line between the keyframes' 0 and 10, so only the delta can show it
    const patch = new Uint8Array(encoder.encode());
    const v2Header = JSON.stringify({
        ...(JSON.parse(header) as object),
        deltas: 1,
        patchRateMs: 50,
        rooms: ['space'],
        schemaHash: recordingSchemaHash(),
    });
    return [
        v2Header,
        await frame(0, 0),
        JSON.stringify({ t: 0, base: { space: gz64(base) } }),
        JSON.stringify({ t: 0, seg: gz64(encodeSegment([{ dt: 0.5, room: 0, bytes: patch }])) }),
        await frame(1, 10),
        JSON.stringify({ t: 1, base: { space: gz64(base) } }),
        JSON.stringify({ t: 1, seg: Buffer.from('corrupt').toString('base64') }),
        await frame(2, 20),
    ].join('\n');
}

test('plays the delta states of a format-v2 recording, and its keyframes where a segment is corrupt', async ({
    page,
}) => {
    await navigateToScreen(page, '/player.html', { baseURL: gameDriver.baseURL });
    await page.locator('[data-id="file input"]').setInputFiles({
        name: 'v2.sgr',
        mimeType: 'application/x-ndjson',
        buffer: Buffer.from(await v2Recording()),
    });
    const time = page.locator('[data-id="time"]');
    const scrubber = page.locator('[data-id="scrubber"]');
    await expect(time).toHaveText('00:00 / 00:02');
    await page.locator('[data-id="GM Radar"]').click({ delay: 100 });
    await expect(page.getByText('Spaceship Selected')).toBeVisible();
    const angle = page
        .locator('.tp-lblv', { hasText: /^angle/ })
        .locator('input')
        .first();
    const seek = (t: number) =>
        scrubber.evaluate((input: HTMLInputElement, value) => {
            input.value = `${value}`;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }, t);

    await seek(0.5);
    await expect(angle).toHaveValue(/^42/);
    // the corrupt second falls back to its keyframe (or, once the next one is decoded, between 10 and 20)
    await seek(1.5);
    await expect(angle).toHaveValue(/^(10|15)/);
    await seek(0.5);
    await expect(angle).toHaveValue(/^42/);
});
