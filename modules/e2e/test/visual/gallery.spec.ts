import { Page, expect, test } from '@playwright/test';
import { makeDriver } from '../driver';

const gameDriver = makeDriver(test);

const scenes = [
    // Ammo
    'ammo-empty',
    'ammo-full',
    'ammo-low',
    // Armor
    'armor-full-health',
    'armor-light-damage',
    'armor-moderate-damage',
    'armor-heavy-damage',
    'armor-critical',
    'armor-sector-damage',
    // Engineering Status
    'engineering-status-low-energy',
    'engineering-status-full-energy',
    'engineering-status-hull-ok',
    'engineering-status-hull-damaged',
    // GM Radar
    'gm-radar-empty',
    'gm-radar-ships',
    'gm-radar-mixed',
    // Pilot
    'pilot-dashboard-stationary',
    'pilot-dashboard-moving',
    'pilot-dashboard-target-mode',
    // Tactical Radar
    'tactical-radar-empty',
    'tactical-radar-single-ship',
    'tactical-radar-multiple-objects',
    'tactical-radar-with-shells',
    'tactical-radar-firing-arcs',
    'tactical-radar-firing-arcs-limits',
    // Long Range Radar
    'long-range-radar-empty',
    'long-range-radar-single-ship',
    'long-range-radar-multiple-objects',
    'long-range-radar-zoomed-in',
    'long-range-radar-zoomed-out',
    'long-range-radar-scan-beam',
    'long-range-radar-job-indicators',
    // Targeting
    'targeting-no-target',
    'targeting-ship-target',
    'targeting-filters-active',
    'targeting-hits-landed',
    // Tubes Status
    'tubes-status-empty',
    'tubes-status-loaded',
    'tubes-status-loading',
    'tubes-status-cluster',
    // Warp
    'warp-idle',
    'warp-jammed',
    'warp-calibrating',
    'warp-active',
];

/**
 * Layout is reproducible across machines but glyph anti-aliasing is not, so the comparator has to
 * sit above the rasteriser and below anything structural. Both bounds were measured against CI:
 * the same scene rendered on two machines differs by at most 18 pixels at this threshold, while the
 * weakest perturbation any scene produces is 1537 — an 11x margin over the noise and 7.7x under the
 * signal. Lowering the threshold does not buy sensitivity, it buys anti-aliasing: at 0.05 the
 * cross-machine noise is already 1719 pixels, past what several scenes produce when they change.
 */
const SNAPSHOT_OPTIONS = { threshold: 0.15, maxDiffPixels: 200 } as const;

/**
 * Vertical nudge applied to everything a scene rendered, to prove the snapshot assertion can fail.
 * Four pixels is a fraction of the row shift that PR #2013 introduced without this suite noticing —
 * a comparator blind to it is blind to every realistic widget edit.
 */
const PERTURBATION_PX = 4;

async function openScene(page: Page, scene: string) {
    await page.goto(`${gameDriver.baseURL}/gallery.html?scene=${scene}`);
    await page.waitForFunction(() => (window as unknown as { __PIXI_READY__: boolean }).__PIXI_READY__ === true, {
        timeout: 10000,
    });
    await page.waitForTimeout(100);
    return page.locator('#container');
}

test.describe('Visual Gallery', () => {
    test.describe.configure({ mode: 'parallel' });

    for (const scene of scenes) {
        test(`${scene} renders correctly`, async ({ page }) => {
            const container = await openScene(page, scene);
            await expect(container).toBeVisible();
            await expect(container).toHaveScreenshot(`${scene}.png`, SNAPSHOT_OPTIONS);
        });
    }

    for (const scene of scenes) {
        test(`${scene} snapshot detects a perturbed widget`, async ({ page }) => {
            test.skip(
                !['none', 'missing'].includes(test.info().config.updateSnapshots),
                'snapshot-update mode would rewrite the baseline from the perturbed render',
            );
            const container = await openScene(page, scene);
            await page.evaluate((offset) => {
                for (const child of Array.from(document.getElementById('container')!.children)) {
                    (child as HTMLElement).style.transform = `translateY(${offset}px)`;
                }
            }, PERTURBATION_PX);
            let matchedBaseline = true;
            try {
                await expect(container).toHaveScreenshot(`${scene}.png`, { ...SNAPSHOT_OPTIONS, timeout: 2000 });
            } catch {
                matchedBaseline = false;
            }
            expect(
                matchedBaseline,
                `shifting the widget by ${PERTURBATION_PX}px still matched the baseline — this scene's snapshot cannot fail`,
            ).toBe(false);
        });
    }

    test('gallery shows error for unknown scene', async ({ page }) => {
        await page.goto(`${gameDriver.baseURL}/gallery.html?scene=nonexistent-scene`);

        const error = page.locator('#error');
        await expect(error).toBeVisible();
        await expect(error).toContainText('Unknown scene');
    });

    test('gallery unknown-scene error lists available scenes', async ({ page }) => {
        await page.goto(`${gameDriver.baseURL}/gallery.html?scene=nonexistent-scene`);

        const error = page.locator('#error');
        await expect(error).toBeVisible();
        await expect(error).toContainText('ammo-empty');
        await expect(error).toContainText('warp-active');
    });

    test('gallery auto-redirects to first scene when no scene specified', async ({ page }) => {
        await page.goto(`${gameDriver.baseURL}/gallery.html`);
        await page.waitForURL(/\?scene=ammo-empty/);
        const panel = page.locator('[data-id="Gallery"]');
        await expect(panel).toBeVisible();
    });

    test('page title reflects the loaded scene', async ({ page }) => {
        await page.goto(`${gameDriver.baseURL}/gallery.html?scene=pilot-dashboard-stationary`);
        await expect(page).toHaveTitle('pilot-dashboard-stationary — Starwards Gallery');
    });

    test('page title stays static for an unknown scene', async ({ page }) => {
        await page.goto(`${gameDriver.baseURL}/gallery.html?scene=nonexistent-scene`);
        await expect(page).toHaveTitle('Starwards Visual Gallery');
    });
});
