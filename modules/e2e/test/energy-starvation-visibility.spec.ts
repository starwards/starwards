import { Locator, expect, test } from '@playwright/test';
import { RepairPriority, SmartPilotMode } from '@starwards/core';
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { makeDriver } from './driver';

import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;

// #2136: a depleted reactor silently zeroes thrust/repairs while the Systems Status panel stays
// green — the crew has no way to tell "nothing is happening" apart from "everything is fine".

/**
 * Whether any Status-column cell in a `drawSystemsStatus` table currently reads `status` — those
 * cells are disabled text inputs whose value is set via the JS property, so a `[value=...]`
 * selector can't see it; only reading `.value` live off each element does.
 */
function hasStatusValue(panel: Locator, status: string): Promise<boolean> {
    return panel.locator('input').evaluateAll((inputs, expected) => {
        return (inputs as HTMLInputElement[]).some((input) => input.value === expected);
    }, status);
}

test.describe('Pilot Screen — energy starvation visibility', () => {
    const gameDriver = makeDriver(test);

    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
        await navigateToScreen(page, `/pilot.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('a depleted reactor marks a starved thruster and warns on the energy readout, instead of reading green', async ({
        page,
    }) => {
        const systemsPanel = page.locator('[data-id="Systems Status"]');
        await expect(systemsPanel).toBeVisible({ timeout: 10000 });

        const ship = gameDriver.getShip(shipId);
        // effeciencyFactor=0 stops the reactor's own per-tick recharge (EnergyManager.update), so
        // energy stays pinned at 0 deterministically instead of creeping back up between assertions
        ship.state.reactor.effeciencyFactor = 0;
        ship.state.reactor.energy = 0;
        ship.state.smartPilot.maneuveringMode = SmartPilotMode.DIRECT;
        ship.state.smartPilot.maneuvering.x = 1; // boost commanded — thrusters try to draw energy every tick

        // the Status column renders as disabled text inputs (tableRow cells) whose value is set via
        // the JS property, not the HTML attribute — a `[value=...]` CSS/XPath selector can't see it
        await expect.poll(() => hasStatusValue(systemsPanel, 'STARVED'), { timeout: 5000 }).toBe(true);

        const reactorPanel = page.locator('[data-id="Reactor"]');
        await expect(reactorPanel).toBeVisible();
        const energyLabel = reactorPanel.getByText('energy level', { exact: true });
        await expect(energyLabel.locator('..')).toHaveAttribute('data-status', 'ERROR');
    });

    test('a healthy reactor reads OK on the energy readout and marks no system starved', async ({ page }) => {
        const systemsPanel = page.locator('[data-id="Systems Status"]');
        await expect(systemsPanel).toBeVisible({ timeout: 10000 });

        expect(await hasStatusValue(systemsPanel, 'STARVED')).toBe(false);

        const reactorPanel = page.locator('[data-id="Reactor"]');
        const energyLabel = reactorPanel.getByText('energy level', { exact: true });
        await expect(energyLabel.locator('..')).toHaveAttribute('data-status', 'OK');
    });
});

test.describe('Engineer Screen — energy starvation visibility', () => {
    const gameDriver = makeDriver(test);

    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);

        await navigateToScreen(page, `/engineer.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    function repairSlot(ship: ReturnType<typeof gameDriver.getShip>, protocolId: string) {
        const slot = ship.state.repairQueue.slots.find((s) => s.protocolId === protocolId);
        if (!slot) {
            throw new Error(`no repair slot for protocol "${protocolId}"`);
        }
        return slot;
    }

    /** Scopes to a single protocol's row (a Tweakpane sub-folder titled with the protocol name). */
    function repairRow(repairQueuePanel: Locator, protocolName: string) {
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

    test('a repair stalled by an energy shortfall shows why while it is still stalled, not only once it aborts', async ({
        page,
    }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });
        const ship = gameDriver.getShip(shipId);

        await page.keyboard.press('Alt+1'); // actuatorRecalibration — first catalog entry
        await expect
            .poll(() => repairSlot(ship, 'actuatorRecalibration').priority, { timeout: 5000 })
            .toBe(RepairPriority.RUNNING);

        // deterministic zero, same as the abort test below — but checked well inside the
        // ENERGY_STARVATION_GRACE_SECONDS window (2s), before the run would actually abort
        ship.state.reactor.effeciencyFactor = 0;
        ship.state.reactor.energy = 0;

        await expect.poll(() => repairSlot(ship, 'actuatorRecalibration').energyStarved, { timeout: 1500 }).toBe(true);
        expect(repairSlot(ship, 'actuatorRecalibration').priority).toBe(RepairPriority.RUNNING); // stalled, not aborted

        // proves the field reaches the widget live, which is what a stalled repair needs:
        // RepairProtocolSlot.energyStarved true while the slot is still RUNNING.
        const row = repairRow(repairQueuePanel, 'Actuator recalibration');
        await expect.poll(() => readSlotField(row, 'repair energy'), { timeout: 5000 }).toBe('true');
    });

    test('a sustained energy shortfall aborts the running repair and says why, not just that it stopped', async ({
        page,
    }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });
        const ship = gameDriver.getShip(shipId);

        await page.keyboard.press('Alt+1'); // actuatorRecalibration — first catalog entry
        await expect
            .poll(() => repairSlot(ship, 'actuatorRecalibration').priority, { timeout: 5000 })
            .toBe(RepairPriority.RUNNING);

        // "reactor too damaged to replenish energy" (the issue's actual root cause) — not just a
        // momentary energy=0. The reactor recharges every tick (EnergyManager.update); the repair's
        // own draw is small (2/s) so a live, still-recharging reactor recovers enough between ticks
        // to keep succeeding and never accumulates a SUSTAINED shortfall. Killing effeciencyFactor
        // stops recharge outright, so energy stays pinned at 0 deterministically.
        ship.state.reactor.effeciencyFactor = 0;
        ship.state.reactor.energy = 0;

        await expect
            .poll(() => repairSlot(ship, 'actuatorRecalibration').refusalReason, { timeout: 10000 })
            .toContain('energy');
        expect(repairSlot(ship, 'actuatorRecalibration').priority).toBe(RepairPriority.OFF); // aborted, not stuck silently

        const row = repairRow(repairQueuePanel, 'Actuator recalibration');
        await expect.poll(() => readSlotField(row, 'notice'), { timeout: 5000 }).toContain('energy');
    });
});
