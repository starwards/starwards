import { DockingMode, PowerLevel, RepairPriority } from '@starwards/core';
import { Locator, expect, test } from '@playwright/test';
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expectNonInteractiveBar, makeDriver, waitForPropertyValue } from './driver';

import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

type Ship = ReturnType<typeof gameDriver.getShip>;

function repairSlot(ship: Ship, protocolId: string) {
    const slot = ship.state.repairQueue.slots.find((s) => s.protocolId === protocolId);
    if (!slot) {
        throw new Error(`no repair slot for protocol "${protocolId}"`);
    }
    return slot;
}

/** Scopes to a single protocol's row (a Tweakpane sub-folder titled with the protocol name). */
function repairRow(repairQueuePanel: Locator, protocolName: string): Locator {
    return repairQueuePanel.locator('.tp-fldv', { hasText: protocolName }).first();
}

/** Reads a labeled blade's live value within a scoped row — blade values live in an `<input>`, not as plain text. */
async function readSlotField(row: Locator, label: string): Promise<string> {
    const input = row.locator('.tp-lblv', { hasText: label }).locator('input');
    const dataValue = await input.getAttribute('data-value');
    if (dataValue) {
        return dataValue;
    }
    return await input.inputValue();
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

    test('lists every catalog protocol as a row showing its raise/lower hotkeys, with no click controls (issue #2247)', async ({
        page,
    }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });

        const row = repairRow(repairQueuePanel, 'Sensor-array degauss');
        await expect(row).toBeVisible();
        const info = await readSlotField(row, 'info');
        expect(info).toContain('ALT+4');
        expect(info).toContain('ALT+SHIFT+4');
        expect(info).toContain('30s');
        expect(info).toContain('field');
        // Engineer screen: hotkeys only, no buttons — the GM screen keeps the click path.
        await expect(row.locator('button.tp-btnv_b')).toHaveCount(0);

        const ship = gameDriver.getShip(shipId);
        expect(repairSlot(ship, 'sensorArrayDegauss').priority).toBe(RepairPriority.OFF);
    });

    test('damage report shows a defect, and raising the repair via hotkey drives real progress', async ({ page }) => {
        const ship = gameDriver.getShip(shipId);
        ship.state.radars[0].malfunctionRangeFactor = 0.5;

        const damageReportPanel = page.locator('[data-id="Damage Report"]');
        await expect(damageReportPanel).toBeVisible({ timeout: 10000 });
        await expect(damageReportPanel).toContainText('range fluctuation');

        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible();
        // sensorArrayDegauss is the 4th catalog entry -> alt+4 (see repair-queue.ts hotkey order)
        await page.keyboard.press('Alt+4');

        await expect
            .poll(() => repairSlot(ship, 'sensorArrayDegauss').priority, { timeout: 5000 })
            .toBe(RepairPriority.RUNNING);
        await expect.poll(() => repairSlot(ship, 'sensorArrayDegauss').progress, { timeout: 5000 }).toBeGreaterThan(0);
        // a real progression over time, not a restatement of the wait predicate above
        const firstProgress = repairSlot(ship, 'sensorArrayDegauss').progress;
        await page.waitForTimeout(500);
        expect(repairSlot(ship, 'sensorArrayDegauss').progress).toBeGreaterThan(firstProgress);
        // still running — full completion (30s real time) is exercised by the reactor jump-start
        // test below, whose protocol is short enough to actually finish within the test
        expect(repairSlot(ship, 'sensorArrayDegauss').priority).toBe(RepairPriority.RUNNING);
    });

    test('lowering a RUNNING protocol via hotkey winds it down to OFF, distinct from a self-abort', async ({
        page,
    }) => {
        const ship = gameDriver.getShip(shipId);
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });

        await page.keyboard.press('Alt+4'); // sensorArrayDegauss
        await expect
            .poll(() => repairSlot(ship, 'sensorArrayDegauss').priority, { timeout: 5000 })
            .toBe(RepairPriority.RUNNING);

        await page.keyboard.press('Alt+Shift+4'); // either key on a RUNNING protocol starts the wind-down
        await expect
            .poll(() => repairSlot(ship, 'sensorArrayDegauss').priority, { timeout: 2000 })
            .toBe(RepairPriority.CANCELLING);

        await expect
            .poll(() => repairSlot(ship, 'sensorArrayDegauss').priority, { timeout: 5000 })
            .toBe(RepairPriority.OFF);
        // a deliberate cancel is not a refusal — no reason to show
        expect(repairSlot(ship, 'sensorArrayDegauss').refusalReason).toBe('');
    });

    test('radar traverse servo alignment (#2109) is listed as a field-tier protocol and drives visible progress via hotkey', async ({
        page,
    }) => {
        const ship = gameDriver.getShip(shipId);
        ship.state.radars[1].turnSpeedFactor = 0.6;

        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });
        await expect(repairRow(repairQueuePanel, 'Radar traverse servo alignment')).toBeVisible();

        // radarTraverseServoAlignment is the 5th catalog entry -> alt+5
        await page.keyboard.press('Alt+5');

        await expect
            .poll(() => repairSlot(ship, 'radarTraverseServoAlignment').priority, { timeout: 5000 })
            .toBe(RepairPriority.RUNNING);
        expect(ship.state.radars[1].power).toBe(PowerLevel.SHUTDOWN); // side effect: radar dark while it runs

        await expect
            .poll(() => repairSlot(ship, 'radarTraverseServoAlignment').progress, { timeout: 5000 })
            .toBeGreaterThan(0);
        const firstProgress = repairSlot(ship, 'radarTraverseServoAlignment').progress;
        await page.waitForTimeout(500);
        expect(repairSlot(ship, 'radarTraverseServoAlignment').progress).toBeGreaterThan(firstProgress);
    });

    test('crew station cannot raise a docked-tier protocol, even via its hotkey (A2)', async ({ page }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });
        const ship = gameDriver.getShip(shipId);

        // hullWideSystemsOverhaul is the 10th catalog entry -> alt+0. The key is always bound; the
        // server-side tier gate is what actually refuses it while undocked.
        await page.keyboard.press('Alt+0');

        await expect
            .poll(() => repairSlot(ship, 'hullWideSystemsOverhaul').refusalReason, { timeout: 5000 })
            .not.toBe('');
        expect(repairSlot(ship, 'hullWideSystemsOverhaul').priority).toBe(RepairPriority.OFF);
    });

    test('docking makes a docked-tier protocol raisable via hotkey; undocking mid-run self-aborts it', async ({
        page,
    }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });
        const ship = gameDriver.getShip(shipId);

        ship.state.docking.mode = DockingMode.DOCKED;
        // hullWideSystemsOverhaul is the 10th catalog entry -> alt+0
        await page.keyboard.press('Alt+0');

        await expect
            .poll(() => repairSlot(ship, 'hullWideSystemsOverhaul').priority, { timeout: 5000 })
            .toBe(RepairPriority.RUNNING);

        ship.state.docking.mode = DockingMode.UNDOCKED;

        await expect
            .poll(() => repairSlot(ship, 'hullWideSystemsOverhaul').priority, { timeout: 2000 })
            .toBe(RepairPriority.OFF);
        expect(repairSlot(ship, 'hullWideSystemsOverhaul').refusalReason).not.toBe('');
    });

    test('docking makes armor plate renewal raisable, and its hotkey drives visible progress', async ({ page }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });
        const ship = gameDriver.getShip(shipId);

        ship.state.armor.plateRepairSeconds = 10;
        ship.state.armor.armorPlates[0].layers[0].health = 0;
        ship.state.docking.mode = DockingMode.DOCKED;

        // armorPlateRenewal is the 11th catalog entry -> alt+q
        await page.keyboard.press('Alt+q');

        await expect
            .poll(() => repairSlot(ship, 'armorPlateRenewal').priority, { timeout: 5000 })
            .toBe(RepairPriority.RUNNING);
        await expect.poll(() => repairSlot(ship, 'armorPlateRenewal').progress, { timeout: 5000 }).toBeGreaterThan(0);
        const firstProgress = repairSlot(ship, 'armorPlateRenewal').progress;
        await page.waitForTimeout(500);
        expect(repairSlot(ship, 'armorPlateRenewal').progress).toBeGreaterThan(firstProgress);
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

        await expect
            .poll(() => repairSlot(ship, 'reactorJumpStart').priority, { timeout: 5000 })
            .toBe(RepairPriority.RUNNING);
        await expect.poll(() => ship.state.reactor.energyCells, { timeout: 5000 }).toBe(0); // spent at start
        await expect
            .poll(() => repairSlot(ship, 'reactorJumpStart').priority, { timeout: 15000 })
            .toBe(RepairPriority.OFF);
        expect(repairSlot(ship, 'reactorJumpStart').refusalReason).toBe(''); // completed, not refused

        await expect.poll(() => ship.state.reactor.effeciencyFactor, { timeout: 5000 }).toBeCloseTo(0.3, 1);
        // reactor.energy keeps regenerating every tick once effeciencyFactor is off zero, so this
        // only asserts the jump-start itself landed a meaningful recovery — not an exact value.
        await expect.poll(() => ship.state.reactor.energy, { timeout: 5000 }).toBeGreaterThan(250);
        await expect.poll(() => ship.state.reactor.energyCells, { timeout: 5000 }).toBe(0); // stays spent
        await waitForPropertyValue(page, 'energy cells', (v) => v === '0/2', 'Engineering Status');
    });
});
