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
        if ((await getPropertyValue(page, 'Type', 'Target')) === 'Spaceship') {
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

    // R1: the panel used to sit top-left; it must now sit on the right, vertically centered
    // in its column — matching the precedent set by targeting-status/warp-status/repair-queue.
    test('sits on the right, vertically centered in its column', async ({ page }) => {
        await waitForRadarReady(page);
        const panel = page.locator('[data-id="Target"]');
        await expect(panel).toBeVisible();

        const viewport = page.viewportSize();
        if (!viewport) throw new Error('missing viewport size');
        const box = await panel.boundingBox();
        if (!box) throw new Error('panel has no bounding box');

        // right-aligned: panel's right edge sits near the viewport's right edge
        expect(viewport.width - (box.x + box.width)).toBeLessThan(20);
        // vertically centered: panel's vertical center sits near the viewport's vertical center
        const panelCenterY = box.y + box.height / 2;
        expect(Math.abs(panelCenterY - viewport.height / 2)).toBeLessThan(viewport.height * 0.15);
    });

    // R2: at full scan of a ship contact, the panel must show a directional armor layout and
    // per-tube loadout — what other stations need to handle the contact as an adversary.
    test('full scan of a ship contact shows directional armor and tube loadout', async ({ page }) => {
        gameDriver.getShip(targetShipId).state.tubes[0].loadedProjectile = 'HiExpMissile';
        gameDriver.gameManager.spaceManager.factionIntel.setScanLevel(targetShipId, Faction.Gravitas, ScanLevel.FULL);

        await waitForRadarReady(page);
        await cycleToShipContact(page);

        await expect(page.locator('[data-id="Armor"]')).toBeVisible({ timeout: 10000 });

        const tubesPanel = page.locator('[data-id="Target Tubes"]');
        await expect(tubesPanel).toBeVisible();
        // gravitas carries two tubes, both labeled "ammo loaded" — read every tube row's input
        // rather than a single ambiguous label lookup
        await expect(async () => {
            const values = await tubesPanel
                .locator('input')
                .evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).value));
            expect(values).toContain('HiExpMissile');
        }).toPass({ timeout: 5000 });
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
