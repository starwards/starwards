import { DockingMode, PowerLevel, RepairPriority } from '@starwards/core';
import { Locator, expect, test } from '@playwright/test';
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expectNonInteractiveBar, makeDriver, waitForPropertyValue } from './driver';

import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

/** The repair-queue widget renders one folder per catalog protocol — scope reads to that protocol's own row, since every row shares the same field labels (issue #2247). */
function protocolRow(panel: Locator, protocolName: string): Locator {
    return panel.locator('.tp-fldv', { hasText: protocolName }).first();
}

async function rowValue(row: Locator, labelText: string): Promise<string> {
    const label = row.getByText(labelText, { exact: true });
    await expect(label).toBeVisible();
    const input = label.locator('..').locator('input');
    return await input.inputValue();
}

async function waitForRowValue(
    row: Locator,
    labelText: string,
    condition: (value: string) => boolean,
    timeout = 5000,
): Promise<string> {
    const startTime = Date.now();
    let last = '';
    while (Date.now() - startTime < timeout) {
        last = await rowValue(row, labelText);
        if (condition(last)) {
            return last;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timeout waiting for '${labelText}' to match condition. Final value: ${last}`);
}

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

    test('every catalog protocol renders as its own row, hotkeys-only (no buttons), starting OFF (issue #2247)', async ({
        page,
    }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });

        const row = protocolRow(repairQueuePanel, 'Sensor-array degauss');
        await expect(row).toBeVisible();
        await expect(row).toContainText('ALT+4');
        await expect(row).toContainText('ALT+SHIFT+4');
        // exactly one button: the folder's own collapse/expand toggle — no raise/lower buttons on
        // the engineer screen, hotkeys only (issue #2247)
        await expect(row.locator('button')).toHaveCount(1);
        expect(await rowValue(row, 'priority')).toBe('OFF');
        expect(await rowValue(row, 'details')).toContain('field');
        expect(await rowValue(row, 'details')).toContain('30s');

        const ship = gameDriver.getShip(shipId);
        expect(ship.state.repairQueue.slots.every((s) => s.priority === RepairPriority.OFF)).toBe(true);
    });

    test('damage report shows a defect, and raising/cancelling a repair via hotkey drives its slot', async ({
        page,
    }) => {
        const ship = gameDriver.getShip(shipId);
        ship.state.radars[0].malfunctionRangeFactor = 0.5;

        const damageReportPanel = page.locator('[data-id="Damage Report"]');
        await expect(damageReportPanel).toBeVisible({ timeout: 10000 });
        await expect(damageReportPanel).toContainText('range fluctuation');

        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible();
        const row = protocolRow(repairQueuePanel, 'Sensor-array degauss');
        // sensorArrayDegauss is the 4th catalog entry -> alt+4 (see repair-queue.ts hotkey order)
        await page.keyboard.press('Alt+4');

        await waitForRowValue(row, 'priority', (v) => v === 'RUNNING', 5000);
        const firstProgress = await waitForRowValue(row, 'progress', (v) => parseFloat(v) > 0, 5000);
        // a real progression over time, not a restatement of the wait predicate above
        await page.waitForTimeout(500);
        const laterProgress = await rowValue(row, 'progress');
        expect(parseFloat(laterProgress)).toBeGreaterThan(parseFloat(firstProgress));

        // either hotkey on a RUNNING slot starts the wind-down (cancel = wind-down, issue #2247)
        await page.keyboard.press('Alt+4');
        await waitForRowValue(row, 'priority', (v) => v === 'CANCELLING', 2000);
        await waitForRowValue(row, 'priority', (v) => v === 'OFF', 5000);
        expect(await rowValue(row, 'progress')).toBe('0%');
    });

    test('radar traverse servo alignment (#2109) drives visible progress via hotkey and, in Dark mode, takes the radar dark (issue #2255)', async ({
        page,
    }) => {
        const ship = gameDriver.getShip(shipId);
        ship.state.radars[1].turnSpeedFactor = 0.6;

        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });
        const row = protocolRow(repairQueuePanel, 'Radar traverse servo alignment');
        await expect(row).toBeVisible();
        expect(await rowValue(row, 'mode')).toBe('RESPONSIVE'); // default: no side effect

        // radarTraverseServoAlignment is the 5th catalog entry -> ctrl+alt+5 toggles its mode
        await page.keyboard.press('Control+Alt+5');
        expect(await rowValue(row, 'mode')).toBe('DARK');

        await page.keyboard.press('Alt+5'); // raise priority
        await waitForRowValue(row, 'priority', (v) => v === 'RUNNING', 5000);
        const firstProgress = await waitForRowValue(row, 'progress', (v) => parseFloat(v) > 0, 5000);
        await page.waitForTimeout(500);
        const laterProgress = await rowValue(row, 'progress');
        expect(parseFloat(laterProgress)).toBeGreaterThan(parseFloat(firstProgress));
        expect(ship.state.radars[1].power).toBe(PowerLevel.SHUTDOWN); // side effect: radar dark while it runs (Dark mode)

        // the mode toggle is locked once the slot is RUNNING (issue #2255)
        await page.keyboard.press('Control+Alt+5');
        expect(await rowValue(row, 'mode')).toBe('DARK');
    });

    test('raising priority multiple times steps LOW -> MEDIUM -> HIGH while something else is running (no pre-emption)', async ({
        page,
    }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });
        // actuatorRecalibration=alt+1 occupies the running slot first
        await page.keyboard.press('Alt+1');
        const runningRow = protocolRow(repairQueuePanel, 'Actuator recalibration');
        await waitForRowValue(runningRow, 'priority', (v) => v === 'RUNNING', 5000);

        // thrustLinePurge=alt+2 stays pending behind it and can be stepped through priorities
        const pendingRow = protocolRow(repairQueuePanel, 'Thrust-line purge');
        await page.keyboard.press('Alt+2');
        await waitForRowValue(pendingRow, 'priority', (v) => v === 'LOW', 2000);
        await page.keyboard.press('Alt+2');
        await waitForRowValue(pendingRow, 'priority', (v) => v === 'MEDIUM', 2000);
        await page.keyboard.press('Alt+2');
        await waitForRowValue(pendingRow, 'priority', (v) => v === 'HIGH', 2000);
        // lower it back down
        await page.keyboard.press('Alt+Shift+2');
        await waitForRowValue(pendingRow, 'priority', (v) => v === 'MEDIUM', 2000);

        // the first protocol never lost the running slot throughout
        expect(await rowValue(runningRow, 'priority')).toBe('RUNNING');
    });

    test('crew station cannot raise a docked-tier protocol while undocked, even via its hotkey', async ({ page }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });
        const row = protocolRow(repairQueuePanel, 'Hull-wide systems overhaul');
        await expect(row).toBeVisible(); // always shown — the fixed set of catalog slots (issue #2247)

        // hullWideSystemsOverhaul is the 10th catalog entry -> alt+0. The key is always bound; the
        // server-side tier gate is what actually refuses it while undocked.
        await page.keyboard.press('Alt+0');
        await waitForRowValue(row, 'notice', (v) => v !== '', 5000);
        expect(await rowValue(row, 'priority')).toBe('OFF');

        const ship = gameDriver.getShip(shipId);
        const slot = ship.state.repairQueue.slots.find((s) => s.protocolId === 'hullWideSystemsOverhaul')!;
        expect(slot.priority).toBe(RepairPriority.OFF);
    });

    test('docking makes a docked-tier protocol raisable, and undocking mid-run force-stops it', async ({ page }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });
        const row = protocolRow(repairQueuePanel, 'Hull-wide systems overhaul');

        const ship = gameDriver.getShip(shipId);
        ship.state.docking.mode = DockingMode.DOCKED;

        // hullWideSystemsOverhaul is the 10th catalog entry -> alt+0
        await page.keyboard.press('Alt+0');
        await waitForRowValue(row, 'priority', (v) => v === 'RUNNING', 5000);

        ship.state.docking.mode = DockingMode.UNDOCKED;

        await waitForRowValue(row, 'priority', (v) => v === 'OFF', 2000);
        await waitForRowValue(row, 'notice', (v) => v !== '', 2000);
    });

    test('docking makes armor plate renewal raisable and drives visible progress via hotkey', async ({ page }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });
        const row = protocolRow(repairQueuePanel, 'Armor plate renewal');

        const ship = gameDriver.getShip(shipId);
        ship.state.armor.plateRepairSeconds = 10;
        ship.state.armor.armorPlates[0].layers[0].health = 0;
        ship.state.docking.mode = DockingMode.DOCKED;

        // armorPlateRenewal is the 11th catalog entry -> alt+q
        await page.keyboard.press('Alt+q');

        await waitForRowValue(row, 'priority', (v) => v === 'RUNNING', 5000);
        const firstProgress = await waitForRowValue(row, 'progress', (v) => parseFloat(v) > 0, 5000);
        await page.waitForTimeout(500);
        const laterProgress = await rowValue(row, 'progress');
        expect(parseFloat(laterProgress)).toBeGreaterThan(parseFloat(firstProgress));
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

        const row = protocolRow(repairQueuePanel, 'Reactor jump-start');
        // reactorJumpStart is the 13th catalog entry -> alt+e
        await page.keyboard.press('Alt+e');

        await waitForRowValue(row, 'priority', (v) => v === 'RUNNING', 5000);
        await waitForRowValue(row, 'priority', (v) => v === 'OFF', 15000);

        await expect.poll(() => ship.state.reactor.effeciencyFactor, { timeout: 5000 }).toBeCloseTo(0.3, 1);
        // reactor.energy keeps regenerating every tick once effeciencyFactor is off zero, so this
        // only asserts the jump-start itself landed a meaningful recovery — not an exact value.
        await expect.poll(() => ship.state.reactor.energy, { timeout: 5000 }).toBeGreaterThan(250);
        await expect.poll(() => ship.state.reactor.energyCells, { timeout: 5000 }).toBe(0);
        await waitForPropertyValue(page, 'energy cells', (v) => v === '0/2', 'Engineering Status');
    });
});
