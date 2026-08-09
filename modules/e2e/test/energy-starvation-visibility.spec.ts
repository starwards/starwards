import { Locator, expect, test } from '@playwright/test';
import { RepairOperationStatus, SmartPilotMode } from '@starwards/core';
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { getPropertyValue, makeDriver } from './driver';

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

test.describe('ECR Screen — energy starvation visibility', () => {
    const gameDriver = makeDriver(test);

    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);

        const ship = gameDriver.getShip(shipId);
        ship.state.ecrControl = true;

        await navigateToScreen(page, `/ecr.html?station=ecr&ship=${shipId}`, { baseURL: gameDriver.baseURL });
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('a sustained energy shortfall aborts the active repair and says why, not just that it stopped', async ({
        page,
    }) => {
        const repairQueuePanel = page.locator('[data-id="Repair Queue"]');
        await expect(repairQueuePanel).toBeVisible({ timeout: 10000 });
        const ship = gameDriver.getShip(shipId);

        await page.keyboard.press('Alt+1'); // actuatorRecalibration — first catalog entry
        await expect
            .poll(() => ship.state.repairQueue.operations[0]?.status, { timeout: 5000 })
            .toBe(RepairOperationStatus.ACTIVE);

        // "reactor too damaged to replenish energy" (the issue's actual root cause) — not just a
        // momentary energy=0. The reactor recharges every tick (EnergyManager.update); the repair's
        // own draw is small (2/s) so a live, still-recharging reactor recovers enough between ticks
        // to keep succeeding and never accumulates a SUSTAINED shortfall. Killing effeciencyFactor
        // stops recharge outright, so energy stays pinned at 0 deterministically.
        ship.state.reactor.effeciencyFactor = 0;
        ship.state.reactor.energy = 0;

        await expect.poll(() => ship.state.repairQueue.refusalReason, { timeout: 10000 }).toContain('energy');
        expect(ship.state.repairQueue.operations.length).toBe(0); // aborted, not stuck silently

        const readout = await getPropertyValue(page, 'notice', 'Repair Queue');
        expect(readout).toContain('energy');
    });
});
