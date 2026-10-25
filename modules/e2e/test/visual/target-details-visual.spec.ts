import { Faction, ScanLevel } from '@starwards/core';
import { Page, expect, test } from '@playwright/test';
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from '../test-infrastructure';
import { getPropertyValue, makeDriver } from '../driver';
import { maps } from '@starwards/server';

// Whole-screen baseline of Target Details: covers the grid layout and clipping, which the gallery scenes don't.
// The target is drawn from a SNAPSHOT captured while the game is paused, so every panel is frozen.
const { two_ships } = maps;
const shipId = two_ships.testShipId;
const targetShipId = two_ships.testTargetShipId;
const gameDriver = makeDriver(test);

// same comparator and perturbation guard as gallery.spec.ts
const SNAPSHOT_OPTIONS = { threshold: 0.15, maxDiffPixels: 200 } as const;
const PERTURBATION_PX = 4;

async function openFrozenTarget(page: Page) {
    const { gameManager } = gameDriver;
    gameManager.state.speed = 0;
    gameManager.spaceManager.state.getShip(targetShipId)!.faction = Faction.Raiders; // own faction never demotes
    const target = gameDriver.getShip(targetShipId).state;
    target.tubes[0].loadedProjectile = 'HiExpMissile';
    for (const layer of target.armor.armorPlates[0].layers) layer.health = 0;
    gameDriver.getShip(shipId).state.signalsTargetId = targetShipId;
    gameManager.spaceManager.factionIntel.setScanLevel(targetShipId, Faction.Gravitas, ScanLevel.FULL);
    await navigateToScreen(page, `/target-details.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
    await expect.poll(() => getPropertyValue(page, 'Intel', 'Target'), { timeout: 10000 }).toBe('LIVE');
    await expect(page.locator('[data-id="Damage"]').first()).toBeVisible({ timeout: 10000 });
    gameManager.spaceManager.factionIntel.update(gameManager.totalSeconds, 1, []);
    await expect
        .poll(() => getPropertyValue(page, 'Intel', 'Target'), { timeout: 10000 })
        .toMatch(/^LAST KNOWN · \d+s$/);
    await expect(page.locator('[data-id="Armor"]')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);
}

// the snapshot age ticks with wall-clock time
function ageReadout(page: Page) {
    return page.locator('[data-id="Target"]').getByText('Intel', { exact: true }).locator('..').locator('input');
}

test.describe('Target Details visual', () => {
    test.use({ viewport: { width: 1920, height: 1080 } });

    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(two_ships);
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('snapshot target at 1920x1080 renders correctly', async ({ page }) => {
        await openFrozenTarget(page);
        await expect(page).toHaveScreenshot('target-details-snapshot-1080p.png', {
            ...SNAPSHOT_OPTIONS,
            mask: [ageReadout(page)],
        });
    });

    test('snapshot target at 1920x1080 detects a perturbed layout', async ({ page }) => {
        test.skip(
            !['none', 'missing'].includes(test.info().config.updateSnapshots),
            'snapshot-update mode would rewrite the baseline from the perturbed render',
        );
        await openFrozenTarget(page);
        await page.evaluate((offset) => {
            document.body.style.transform = `translateY(${offset}px)`;
        }, PERTURBATION_PX);
        let matchedBaseline = true;
        try {
            await expect(page).toHaveScreenshot('target-details-snapshot-1080p.png', {
                ...SNAPSHOT_OPTIONS,
                mask: [ageReadout(page)],
                timeout: 2000,
            });
        } catch {
            matchedBaseline = false;
        }
        expect(matchedBaseline, `shifting the page by ${PERTURBATION_PX}px still matched the baseline`).toBe(false);
    });
});
