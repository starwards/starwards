import { DockingMode, PowerLevel } from '@starwards/core';
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';
import { expectNonInteractiveBar, getPropertyValue, makeDriver, waitForPropertyValue } from './driver';

import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

test.describe('Engineer Screen', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);

        await gameDriver.gameManager.startGame(single_ship);

        await navigateToScreen(page, `/engineer.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('displays all panels and syncs state correctly', async ({ page }) => {
        // Verify all expected panels are visible
        await expect(page.locator('[data-id="Engineering Status"]')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('[data-id="Warp"]')).toBeVisible();
        await expect(page.locator('[data-id="Armor"]')).toBeVisible();
        await expect(page.locator('[data-id="Full Systems Status"]')).toBeVisible();

        // Verify warp state syncs: set known value and check UI
        // Note: Energy uses addGraph() which has no input element, so we test warp level instead
        const ship = gameDriver.getShip(shipId);
        ship.state.warp!.currentLevel = 3;
        await waitForPropertyValue(page, 'Actual LVL', (v) => Math.abs(parseFloat(v) - 3) < 0.5, 'Warp');
    });

    test('coolant and defectible readouts render as non-interactive bars, not draggable sliders', async ({ page }) => {
        const fullStatusPanel = page.locator('[data-id="Full Systems Status"]');
        await expect(fullStatusPanel).toBeVisible({ timeout: 10000 });
        await expectNonInteractiveBar(fullStatusPanel.locator('.sw-bar').first());
    });

    test('warp level readouts render as non-interactive bars, not draggable sliders', async ({ page }) => {
        const warpPanel = page.locator('[data-id="Warp"]');
        await expect(warpPanel).toBeVisible({ timeout: 10000 });
        await expectNonInteractiveBar(warpPanel.locator('.sw-bar').first());
    });

    test('catalog entries render as a readout (name, hotkey, duration, tier, dark systems) — no enqueue buttons', async ({
        page,
    }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });

        // A1: the catalog is display-only — no clickable button anywhere in it enqueues.
        await expect(repairQueuePanel.locator('button.tp-btnv_b', { hasText: 'Sensor-array degauss' })).toHaveCount(0);

        const readout = await getPropertyValue(page, 'Sensor-array degauss', 'Repair Queue');
        expect(readout).toContain('ALT+4');
        expect(readout).toContain('30s');
        expect(readout).toContain('field');

        const ship = gameDriver.getShip(shipId);
        expect(ship.state.repairQueue.operations.length).toBe(0);
    });

    test('clicking a catalog readout has no effect (A1)', async ({ page }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });

        const label = repairQueuePanel.getByText('Sensor-array degauss', { exact: true });
        await expect(label).toBeVisible();
        await label.click({ force: true });
        await page.waitForTimeout(300);

        const ship = gameDriver.getShip(shipId);
        expect(ship.state.repairQueue.operations.length).toBe(0);
    });

    test('damage report shows a defect, and enqueueing/cancelling a repair via hotkey drives the queue', async ({
        page,
    }) => {
        const ship = gameDriver.getShip(shipId);
        ship.state.radars[0].malfunctionRangeFactor = 0.5;

        const damageReportPanel = page.locator('[data-id="Damage Report"]');
        await expect(damageReportPanel).toBeVisible({ timeout: 10000 });
        await expect(damageReportPanel).toContainText('range fluctuation');

        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible();
        // sensorArrayDegauss is the 4th catalog entry -> alt+4 (see repair-queue.ts hotkey order)
        await page.keyboard.press('Alt+4');

        await waitForPropertyValue(page, 'state', (v) => v === 'ACTIVE', 'Repair Queue', 5000);
        const firstProgress = await waitForPropertyValue(
            page,
            'progress',
            (v) => parseFloat(v) > 0,
            'Repair Queue',
            5000,
        );
        // a real progression over time, not a restatement of the wait predicate above
        await page.waitForTimeout(500);
        const laterProgress = await getPropertyValue(page, 'progress', 'Repair Queue');
        expect(parseFloat(laterProgress)).toBeGreaterThan(parseFloat(firstProgress));

        const cancelButton = repairQueuePanel.locator('button.tp-btnv_b', { hasText: 'Cancel' });
        await cancelButton.click();

        // terminal status must reach the client and stay visible for a few seconds (R4) — a
        // cancelled repair is not indistinguishable from one that simply vanished
        await waitForPropertyValue(page, 'state', (v) => v === 'CANCELLED', 'Repair Queue', 2000);
        await expect(repairQueuePanel.getByText('state', { exact: true })).not.toBeVisible({ timeout: 5000 });
    });

    test('radar traverse servo alignment (#2109) is listed as a field-tier protocol and drives visible progress via hotkey', async ({
        page,
    }) => {
        const ship = gameDriver.getShip(shipId);
        ship.state.radars[1].turnSpeedFactor = 0.6;

        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });
        await expect(repairQueuePanel.getByText('Radar traverse servo alignment', { exact: true })).toBeVisible();

        // radarTraverseServoAlignment is the 5th catalog entry -> alt+5
        await page.keyboard.press('Alt+5');

        await waitForPropertyValue(page, 'state', (v) => v === 'ACTIVE', 'Repair Queue', 5000);
        const firstProgress = await waitForPropertyValue(
            page,
            'progress',
            (v) => parseFloat(v) > 0,
            'Repair Queue',
            5000,
        );
        await page.waitForTimeout(500);
        const laterProgress = await getPropertyValue(page, 'progress', 'Repair Queue');
        expect(parseFloat(laterProgress)).toBeGreaterThan(parseFloat(firstProgress));
        expect(ship.state.radars[1].power).toBe(PowerLevel.SHUTDOWN); // side effect: radar dark while the op runs
    });

    test('crew station cannot enqueue a docked-tier protocol, even via its hotkey (A2)', async ({ page }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });
        await expect(repairQueuePanel.getByText('Hull-wide systems overhaul', { exact: true })).not.toBeVisible();

        // hullWideSystemsOverhaul is the 10th catalog entry -> alt+0. The key is always bound; the
        // server-side tier gate is what actually refuses it while undocked.
        await page.keyboard.press('Alt+0');
        await waitForPropertyValue(page, 'notice', (v) => v !== '', 'Repair Queue', 5000);

        const ship = gameDriver.getShip(shipId);
        expect(ship.state.repairQueue.operations.some((o) => o.protocolId === 'hullWideSystemsOverhaul')).toBe(false);
    });

    test('docking live-reveals a docked-tier protocol, and enqueueing it via hotkey drives the queue', async ({
        page,
    }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });
        const overhaulLabel = repairQueuePanel.getByText('Hull-wide systems overhaul', { exact: true });
        await expect(overhaulLabel).not.toBeVisible();

        const ship = gameDriver.getShip(shipId);
        ship.state.docking.mode = DockingMode.DOCKED;

        await expect(overhaulLabel).toBeVisible({ timeout: 5000 });
        // hullWideSystemsOverhaul is the 10th catalog entry -> alt+0
        await page.keyboard.press('Alt+0');

        await waitForPropertyValue(page, 'state', (v) => v === 'ACTIVE', 'Repair Queue', 5000);
        expect(ship.state.repairQueue.operations.some((o) => o.protocolId === 'hullWideSystemsOverhaul')).toBe(true);

        ship.state.docking.mode = DockingMode.UNDOCKED;

        await waitForPropertyValue(page, 'state', (v) => v === 'CANCELLED', 'Repair Queue', 2000);
    });

    test('docking live-reveals armor plate renewal, and enqueueing it via hotkey drives visible progress', async ({
        page,
    }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });
        const renewalLabel = repairQueuePanel.getByText('Armor plate renewal', { exact: true });
        await expect(renewalLabel).not.toBeVisible();

        const ship = gameDriver.getShip(shipId);
        ship.state.armor.plateRepairSeconds = 10;
        ship.state.armor.armorPlates[0].layers[0].health = 0;
        ship.state.docking.mode = DockingMode.DOCKED;

        await expect(renewalLabel).toBeVisible({ timeout: 5000 });
        // armorPlateRenewal is the 11th catalog entry -> alt+q
        await page.keyboard.press('Alt+q');

        await waitForPropertyValue(page, 'state', (v) => v === 'ACTIVE', 'Repair Queue', 5000);
        expect(ship.state.repairQueue.operations.some((o) => o.protocolId === 'armorPlateRenewal')).toBe(true);
        const firstProgress = await waitForPropertyValue(
            page,
            'progress',
            (v) => parseFloat(v) > 0,
            'Repair Queue',
            5000,
        );
        await page.waitForTimeout(500);
        const laterProgress = await getPropertyValue(page, 'progress', 'Repair Queue');
        expect(parseFloat(laterProgress)).toBeGreaterThan(parseFloat(firstProgress));
    });

    test('reordering via Move up drives the server-side queue order through the real command path', async ({
        page,
    }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });

        // actuatorRecalibration=alt+1, thrustLinePurge=alt+2, feedSystemOverhaul=alt+3
        await page.keyboard.press('Alt+1');
        await page.keyboard.press('Alt+2');
        await page.keyboard.press('Alt+3');

        const ship = gameDriver.getShip(shipId);
        await expect
            .poll(() => ship.state.repairQueue.operations.map((o) => o.protocolId), { timeout: 5000 })
            .toEqual(['actuatorRecalibration', 'thrustLinePurge', 'feedSystemOverhaul']);

        // move the last queued row ("Feed-system overhaul") up, ahead of "Thrust-line purge" —
        // "Actuator recalibration" (index 0) is ACTIVE and has no move buttons at all
        await repairQueuePanel.locator('button.tp-btnv_b', { hasText: 'Move up' }).nth(1).click();

        await expect
            .poll(() => ship.state.repairQueue.operations.map((o) => o.protocolId), { timeout: 5000 })
            .toEqual(['actuatorRecalibration', 'feedSystemOverhaul', 'thrustLinePurge']);
    });

    test('a refused enqueue (queue full) shows a notice instead of silently doing nothing', async ({ page }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });
        const ship = gameDriver.getShip(shipId);

        // 16 is the queue cap. Waiting for each press to land server-side before the next (rather
        // than firing all 17 back-to-back) keeps this reliable under CI's heavier load, where a
        // tight keydown/keyup loop can outrun the hotkeys-js -> command round trip.
        for (let i = 0; i < 16; i++) {
            await page.keyboard.press('Alt+4'); // sensorArrayDegauss
            await expect.poll(() => ship.state.repairQueue.operations.length, { timeout: 5000 }).toBe(i + 1);
        }
        await page.keyboard.press('Alt+4'); // the 17th must be refused

        // Read the refusal off server state directly, not the client-rendered panel: the notice
        // auto-clears after TERMINAL_DISPLAY_SECONDS (2s, real time, server-side) regardless of how
        // long the colyseus round trip to the client takes, so polling the DOM races that window
        // under CI's heavier load. Server state is the authoritative, immediate source of truth for
        // "did the hotkey's enqueue get refused".
        await expect.poll(() => ship.state.repairQueue.refusalReason, { timeout: 5000 }).not.toBe('');
    });

    test('reactor jump-start (#2137) recovers a zero-energy, damaged reactor and spends one energy cell', async ({
        page,
    }) => {
        const ship = gameDriver.getShip(shipId);
        ship.state.reactor.energy = 0;
        ship.state.reactor.effeciencyFactor = 0;
        ship.state.reactor.energyCells = 1;

        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });
        const engineeringStatusPanel = page.locator('[data-id="Engineering Status"]');
        await expect(engineeringStatusPanel).toBeVisible({ timeout: 10000 });
        await waitForPropertyValue(page, 'energy cells', (v) => v === '1/2', 'Engineering Status');

        // reactorJumpStart is the 13th catalog entry -> alt+e
        await page.keyboard.press('Alt+e');

        await waitForPropertyValue(page, 'state', (v) => v === 'ACTIVE', 'Repair Queue', 5000);
        await waitForPropertyValue(page, 'state', (v) => v === 'DONE', 'Repair Queue', 15000);

        await expect.poll(() => ship.state.reactor.effeciencyFactor, { timeout: 5000 }).toBeCloseTo(0.3, 1);
        // reactor.energy keeps regenerating every tick once effeciencyFactor is off zero, so this
        // only asserts the jump-start itself landed a meaningful recovery — not an exact value.
        await expect.poll(() => ship.state.reactor.energy, { timeout: 5000 }).toBeGreaterThan(250);
        await expect.poll(() => ship.state.reactor.energyCells, { timeout: 5000 }).toBe(0);
        await waitForPropertyValue(page, 'energy cells', (v) => v === '0/2', 'Engineering Status');
    });
});
