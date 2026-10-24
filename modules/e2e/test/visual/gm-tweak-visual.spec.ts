import { Page, expect, test } from '@playwright/test';
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from '../test-infrastructure';
import { makeDriver } from '../driver';
import { maps } from '@starwards/server';

// The GM tweak panel on a selected Spaceship, with the Resupply/Repair quick actions (M4.62).
// The game is paused so every readout in the panel is frozen.
const { single_ship } = maps;
const gameDriver = makeDriver(test);

// same comparator and perturbation guard as gallery.spec.ts
const SNAPSHOT_OPTIONS = { threshold: 0.15, maxDiffPixels: 200 } as const;
const PERTURBATION_PX = 4;

async function openSelectedShip(page: Page) {
    gameDriver.gameManager.state.speed = 0;
    await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });
    const radar = page.locator('[data-id="GM Radar"]');
    await expect(radar).toBeVisible({ timeout: 15000 });
    const box = await radar.boundingBox();
    if (!box) throw new Error('GM Radar canvas has no bounding box');
    await radar.click({ position: { x: box.width / 2, y: box.height / 2 } });
    const tweakPanel = page.locator('[data-id="Tweaks"]');
    const resupply = tweakPanel.locator('button', { hasText: 'Resupply (ammo, energy, fuel)' });
    await expect(resupply).toBeVisible({ timeout: 10000 });
    await resupply.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    // the golden-layout tab body: the "Tweaks" element itself is taller than the tab it scrolls in
    return page.locator('.lm_content', { has: tweakPanel });
}

test.describe('GM tweak panel visual', () => {
    test.use({ viewport: { width: 1920, height: 1080 } });

    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('selected ship shows Resupply and Repair buttons', async ({ page }) => {
        const tweakPanel = await openSelectedShip(page);
        await expect(tweakPanel).toHaveScreenshot('gm-tweak-selected-ship.png', SNAPSHOT_OPTIONS);
    });

    test('selected ship snapshot detects a perturbed layout', async ({ page }) => {
        test.skip(
            !['none', 'missing'].includes(test.info().config.updateSnapshots),
            'snapshot-update mode would rewrite the baseline from the perturbed render',
        );
        const tweakPanel = await openSelectedShip(page);
        await tweakPanel.evaluate((el, offset) => {
            for (const child of Array.from(el.querySelectorAll('button'))) {
                (child as HTMLElement).style.transform = `translateY(${offset}px)`;
            }
        }, PERTURBATION_PX);
        let matchedBaseline = true;
        try {
            await expect(tweakPanel).toHaveScreenshot('gm-tweak-selected-ship.png', {
                ...SNAPSHOT_OPTIONS,
                timeout: 2000,
            });
        } catch {
            matchedBaseline = false;
        }
        expect(matchedBaseline, `shifting the panel by ${PERTURBATION_PX}px still matched the baseline`).toBe(false);
    });
});
