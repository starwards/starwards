import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';
import { makeDriver } from './driver';

import { maps } from '@starwards/server';

const { single_ship } = maps;
const gameDriver = makeDriver(test);

test.describe('GM Screen', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);

        await gameDriver.gameManager.startGame(single_ship);

        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('displays golden-layout panels', async ({ page }) => {
        // GM screen uses golden-layout with radar, tweak, and create panels
        await expect(page.locator('.lm_goldenlayout')).toBeVisible({ timeout: 10000 });

        // Verify the default panels are present in the layout
        const items = page.locator('.lm_item');
        await expect(items.first()).toBeVisible();
    });

    test('loads ship-specific widgets after game starts', async ({ page }) => {
        // Wait for the GM radar to render (the main panel)
        await expect(page.locator('.lm_goldenlayout')).toBeVisible({ timeout: 10000 });

        // The GM screen dynamically adds per-ship widgets. Wait for at least
        // one ship widget to appear in the layout's registered widget menu.
        const menuContainer = page.locator('#menuContainer');
        await expect(menuContainer).toBeVisible({ timeout: 10000 });
    });

    test('does not reset radar view when a new ship is created via GM UI', async ({ page }) => {
        const radarCanvas = page.locator('[data-id="GM Radar"]');
        await expect(radarCanvas).toBeVisible({ timeout: 15000 });

        // Wait for all initial ship widgets to be registered (GVTS long range radar is last)
        const menuContainer = page.locator('#menuContainer');
        await expect(menuContainer.locator('[data-id="menu-GVTS long range radar"]')).toBeVisible({
            timeout: 15000,
        });

        // Count menu items after initial setup
        const initialMenuCount = await menuContainer.locator('li[data-id]').count();

        // Scroll on the radar to zoom out (deltaY=500 → zoom changes from 1.0 to ~0.5)
        await radarCanvas.hover();
        await page.mouse.wheel(0, 500);

        // Wait for data-zoom attribute to update
        await page.waitForTimeout(300);

        // Verify zoom changed from default 1.0
        const zoomAfterScroll = parseFloat((await radarCanvas.getAttribute('data-zoom')) ?? '1');
        expect(zoomAfterScroll).toBeLessThan(1.0);

        // Switch to the "create" tab in the GM panel
        const createTab = page.locator('.lm_title', { hasText: 'create' });
        await createTab.click();

        // Click the "Create Ship" action button (tp-btnv_b) to enter ship placement mode
        const createShipButton = page.locator('button.tp-btnv_b', { hasText: 'Create Ship' });
        await expect(createShipButton).toBeVisible({ timeout: 5000 });
        await createShipButton.click();

        // Click on the radar canvas to place the new ship
        await radarCanvas.click({ position: { x: 100, y: 100 } });

        // Wait for the new ship's widgets to appear in the menu (count increases by at least 1)
        await expect(async () => {
            const count = await menuContainer.locator('li[data-id]').count();
            expect(count).toBeGreaterThan(initialMenuCount);
        }).toPass({ timeout: 15000 });

        // The radar zoom must NOT have reset to 1.0
        const zoomAfterShipAdded = parseFloat((await radarCanvas.getAttribute('data-zoom')) ?? '1');
        expect(zoomAfterShipAdded).toBeCloseTo(zoomAfterScroll, 2);
    });

    test('tweak panel shows velocity, targetId and radarRange for a selected spaceship', async ({ page }) => {
        const radarCanvas = page.locator('[data-id="GM Radar"]');
        await expect(radarCanvas).toBeVisible({ timeout: 15000 });

        // the single_ship map spawns the player ship at world (0,0), which the
        // default (unpanned, zoom=1) GM camera maps to the canvas center.
        const box = await radarCanvas.boundingBox();
        if (!box) throw new Error('GM Radar canvas has no bounding box');
        await radarCanvas.click({ position: { x: box.width / 2, y: box.height / 2 } });

        const tweakPanel = page.locator('[data-id="Tweaks"]');
        await expect(tweakPanel.getByText('velocity', { exact: true })).toBeVisible({ timeout: 5000 });
        await expect(tweakPanel.getByText('radarRange', { exact: true })).toBeVisible();
        // 'targetId' also appears inside the (unrelated, collapsed) Docking system
        // folder further down the panel; the ship-level one we add is the first
        // in DOM order since it's wired up before the per-system folders loop.
        await expect(tweakPanel.getByText('targetId', { exact: true }).first()).toBeVisible();
    });

    test('velocity set via the tweak panel persists (does not get thrusted away by the smart pilot)', async ({
        page,
    }) => {
        const radarCanvas = page.locator('[data-id="GM Radar"]');
        await expect(radarCanvas).toBeVisible({ timeout: 15000 });

        const box = await radarCanvas.boundingBox();
        if (!box) throw new Error('GM Radar canvas has no bounding box');
        await radarCanvas.click({ position: { x: box.width / 2, y: box.height / 2 } });

        const tweakPanel = page.locator('[data-id="Tweaks"]');
        const velocityLabel = tweakPanel.getByText('velocity', { exact: true });
        await expect(velocityLabel).toBeVisible({ timeout: 5000 });
        const velocityInputs = velocityLabel.locator('..').locator('input');

        await velocityInputs.nth(0).fill('50');
        await velocityInputs.nth(0).press('Enter');
        await velocityInputs.nth(1).fill('-30');
        await velocityInputs.nth(1).press('Enter');

        // The ship's own smart pilot (velocity-hold by default) would otherwise thrust a
        // GM-forced velocity away again within a tick or two; give it ample time to prove
        // the value sticks instead of just checking immediately after the write.
        const [ship] = gameDriver.gameManager.spaceManager.state.getAll('Spaceship');
        await expect(() => {
            expect(ship.velocity.x).toBeCloseTo(50, 0);
            expect(ship.velocity.y).toBeCloseTo(-30, 0);
        }).toPass({ timeout: 2000 });
        // ...and stays put a bit longer, ruling out a slow decay back towards zero.
        await page.waitForTimeout(1000);
        expect(ship.velocity.x).toBeCloseTo(50, 0);
        expect(ship.velocity.y).toBeCloseTo(-30, 0);
    });

    test('velocity set by dragging the point2d pad persists', async ({ page }) => {
        const radarCanvas = page.locator('[data-id="GM Radar"]');
        await expect(radarCanvas).toBeVisible({ timeout: 15000 });

        const box = await radarCanvas.boundingBox();
        if (!box) throw new Error('GM Radar canvas has no bounding box');
        await radarCanvas.click({ position: { x: box.width / 2, y: box.height / 2 } });

        const tweakPanel = page.locator('[data-id="Tweaks"]');
        const velocityLabel = tweakPanel.getByText('velocity', { exact: true });
        await expect(velocityLabel).toBeVisible({ timeout: 5000 });
        const parent = velocityLabel.locator('..');

        // the point2d blade's draggable pad is hidden behind a toggle button until clicked
        await parent.locator('.tp-p2dv_b').click();
        const pad = parent.locator('.tp-p2dpv_p');
        await expect(pad).toBeVisible({ timeout: 2000 });
        const padBox = await pad.boundingBox();
        if (!padBox) throw new Error('velocity pad has no bounding box');

        const centerX = padBox.x + padBox.width / 2;
        const centerY = padBox.y + padBox.height / 2;
        await page.mouse.move(centerX, centerY);
        await page.mouse.down();
        await page.mouse.move(centerX + 60, centerY - 40, { steps: 10 });
        await page.mouse.up();

        const [ship] = gameDriver.gameManager.spaceManager.state.getAll('Spaceship');
        // A multi-step drag fires one 'change' event (and JSON-pointer command) per mouse-move
        // step, so wait for the flurry of commands to fully round-trip and settle on a single
        // value before treating it as "the" post-drag velocity.
        let settled: { x: number; y: number } | undefined;
        await expect(() => {
            const sample = { x: ship.velocity.x, y: ship.velocity.y };
            const isZero = sample.x === 0 && sample.y === 0;
            const matchesLastSample = settled && sample.x === settled.x && sample.y === settled.y;
            settled = sample;
            expect(isZero || !matchesLastSample).toBe(false);
        }).toPass({ timeout: 2000, intervals: [100] });
        const xAfterDrag = settled!.x;
        const yAfterDrag = settled!.y;

        // must not decay back towards zero the way it did before the smart-pilot-disengage fix.
        await page.waitForTimeout(1000);
        expect(ship.velocity.x).toBeCloseTo(xAfterDrag, 0);
        expect(ship.velocity.y).toBeCloseTo(yAfterDrag, 0);
    });

    test('velocity set via the tweak panel persists on a non-ship object (asteroid)', async ({ page }) => {
        // Unlike a ship, an asteroid has no smart pilot / movement manager fighting the
        // write — so a GM-set velocity should simply stick. It goes through the *generic*
        // vec2 tweakable blade (tweak.ts addTweakables), not the ship-specific velocity
        // handler, so this pins that path independently of the smart-pilot disengage fix.
        const radarCanvas = page.locator('[data-id="GM Radar"]');
        await expect(radarCanvas).toBeVisible({ timeout: 15000 });

        const box = await radarCanvas.boundingBox();
        if (!box) throw new Error('GM Radar canvas has no bounding box');
        // Place the asteroid 150px below the canvas centre (the origin ship): far enough that
        // the later select-click resolves to the asteroid, not the ship, whatever the zoom.
        const placeX = box.width / 2;
        const placeY = box.height / 2 + 150;

        // Create the asteroid through the GM UI (avoids constructing a core class in-test,
        // which would be a different module instance than the server's and get rejected by
        // the schema). 'Create Asteroid' enters placement mode; the next radar click places it.
        const createTab = page.locator('.lm_title', { hasText: 'create' });
        await createTab.click();
        const createAsteroidButton = page.locator('button.tp-btnv_b', { hasText: 'Create Asteroid' });
        await expect(createAsteroidButton).toBeVisible({ timeout: 5000 });
        await createAsteroidButton.click();
        await radarCanvas.click({ position: { x: placeX, y: placeY } });

        await expect(() => {
            expect([...gameDriver.gameManager.spaceManager.state.getAll('Asteroid')].length).toBe(1);
        }).toPass({ timeout: 10000 });
        const [asteroid] = gameDriver.gameManager.spaceManager.state.getAll('Asteroid');

        // Switch back to the tweak panel and select the asteroid by clicking it.
        const tweakTab = page.locator('.lm_title', { hasText: 'tweak' });
        await tweakTab.click();
        const tweakPanel = page.locator('[data-id="Tweaks"]');
        const velocityLabel = tweakPanel.getByText('velocity', { exact: true });
        // Creating the asteroid can change the camera zoom (auto-fit), so a fixed offset no
        // longer maps to the blip. Compute the click from the asteroid's actual position and
        // the live zoom each attempt (camera stays centered on the world origin: zoom-only).
        await expect(async () => {
            const zoom = Number(await radarCanvas.getAttribute('data-zoom'));
            const sx = box.width / 2 + asteroid.position.x * zoom;
            const sy = box.height / 2 + asteroid.position.y * zoom;
            await radarCanvas.click({ position: { x: sx, y: sy } });
            await expect(velocityLabel).toBeVisible({ timeout: 1000 });
        }).toPass({ timeout: 10000 });

        const velocityInputs = velocityLabel.locator('..').locator('input');
        await velocityInputs.nth(0).fill('50');
        await velocityInputs.nth(0).press('Enter');
        await velocityInputs.nth(1).fill('-30');
        await velocityInputs.nth(1).press('Enter');

        await expect(() => {
            expect(asteroid.velocity.x).toBeCloseTo(50, 0);
            expect(asteroid.velocity.y).toBeCloseTo(-30, 0);
        }).toPass({ timeout: 2000 });
        // no physics corrects an asteroid's velocity, so it must simply hold.
        await page.waitForTimeout(1000);
        expect(asteroid.velocity.x).toBeCloseTo(50, 0);
        expect(asteroid.velocity.y).toBeCloseTo(-30, 0);
    });

    test('radius set via the tweak panel persists', async ({ page }) => {
        const radarCanvas = page.locator('[data-id="GM Radar"]');
        await expect(radarCanvas).toBeVisible({ timeout: 15000 });

        const box = await radarCanvas.boundingBox();
        if (!box) throw new Error('GM Radar canvas has no bounding box');
        await radarCanvas.click({ position: { x: box.width / 2, y: box.height / 2 } });

        const tweakPanel = page.locator('[data-id="Tweaks"]');
        // 'radius' is a plain numeric input (not the angle-oriented `cameraring` dial), so it
        // has a single input, same shape as the label lookup used for velocity's x/y pair.
        const radiusLabel = tweakPanel.getByText('radius', { exact: true }).first();
        await expect(radiusLabel).toBeVisible({ timeout: 5000 });
        const radiusInput = radiusLabel.locator('..').locator('input').first();

        await radiusInput.fill('120');
        await radiusInput.press('Enter');

        const [ship] = gameDriver.gameManager.spaceManager.state.getAll('Spaceship');
        await expect(() => {
            expect(ship.radius).toBeCloseTo(120, 0);
        }).toPass({ timeout: 2000 });
        // radius has no ongoing physics correcting it, unlike velocity — confirm it holds.
        await page.waitForTimeout(1000);
        expect(ship.radius).toBeCloseTo(120, 0);
    });
});
