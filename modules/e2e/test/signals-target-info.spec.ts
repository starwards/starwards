import { Faction, ScanLevel } from '@starwards/core';
import { Page, expect, test } from '@playwright/test';
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';

import { getPropertyValue, makeDriver } from './driver';
import { maps } from '@starwards/server';

// two_ships carries exactly two same-faction ships and nothing else — both constructed
// server-side by the map, avoiding the colyseus schema-identity crash that a test-constructed
// Spaceship instance hits (see signals-screen.spec.ts's asteroid note), and keeping the target
// cycle a single press (no asteroids/NPCs to cycle past first).
const { two_ships } = maps;
const shipId = two_ships.testShipId;
const targetShipId = two_ships.testTargetShipId;
const gameDriver = makeDriver(test);

async function waitForRadarReady(page: Page) {
    await expect(page.locator('[data-id="Long Range Radar"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-id="Scan Beam"]')).toBeVisible({ timeout: 10000 });
}

async function cycleToShipContact(page: Page, maxAttempts = 5) {
    for (let i = 0; i < maxAttempts; i++) {
        await page.keyboard.press(']');
        if ((await getPropertyValue(page, 'Type', 'Contact')) === 'Spaceship') {
            return;
        }
    }
    throw new Error('did not cycle onto a ship contact');
}

test.describe('Signals Screen - Target Info panel', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(two_ships);
        await navigateToScreen(page, `/signals.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    // R1: the panel sits at the top of the right column, matching the Signals artboard.
    test('sits at the top of the right column', async ({ page }) => {
        await waitForRadarReady(page);
        const panel = page.locator('[data-id="Contact"]');
        await expect(panel).toBeVisible();

        const viewport = page.viewportSize();
        if (!viewport) throw new Error('missing viewport size');
        const box = await panel.boundingBox();
        if (!box) throw new Error('panel has no bounding box');

        // right-aligned: panel's right edge sits near the viewport's right edge
        expect(viewport.width - (box.x + box.width)).toBeLessThan(20);
        // top of the column: panel's top edge sits near the viewport's top edge
        expect(box.y).toBeLessThan(30);
    });

    // SPEC-0008 §6: target internals moved to the Target Details screen — even at full scan of a ship
    // contact, the Contact panel draws no armor or tube widgets.
    test('full scan of a ship contact shows no armor or tube widgets', async ({ page }) => {
        gameDriver.gameManager.spaceManager.factionIntel.setScanLevel(targetShipId, Faction.Gravitas, ScanLevel.FULL);

        await waitForRadarReady(page);
        await cycleToShipContact(page);
        await expect.poll(() => getPropertyValue(page, 'Scan level', 'Contact')).toBe('FULL');
        await page.waitForTimeout(1500);

        await expect(page.locator('[data-id="Armor"]')).toHaveCount(0);
        await expect(page.locator('[data-id="Target Tubes"]')).toHaveCount(0);
    });

    // A3: lower scan tiers (here: BASIC, same-faction default) must not render the full-scan
    // widgets — only the highest tier reveals armor/tubes.
    test('below full scan, a ship contact shows no armor or tube widgets', async ({ page }) => {
        await waitForRadarReady(page);
        await cycleToShipContact(page);

        await expect(page.locator('[data-id="Armor"]')).toBeHidden();
        await expect(page.locator('[data-id="Target Tubes"]')).toBeHidden();
    });
});
