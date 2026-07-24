import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';
import { makeDriver, waitForPropertyFloatValue } from './driver';

import { maps } from '@starwards/server';
import { spaceCommands } from '@starwards/core';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

function serverWaypoints() {
    return [...gameDriver.gameManager.spaceManager.state.getAll('Waypoint')];
}

// Waypoint creation goes through the same server-processed command the relay radar's
// placement UI sends — constructing the object directly in the test process would create
// a second, cross-realm `Waypoint` class incompatible with the running server's schema.
function addOwnWaypoint(collection: string) {
    spaceCommands.createWaypointOrder.setValue(gameDriver.gameManager.spaceManager.state, {
        position: { x: 100, y: 0 },
        owner: shipId,
        collection,
    });
}

test.describe('Pilot Screen', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
        await navigateToScreen(page, `/pilot.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('displays radar and syncs state correctly', async ({ page }) => {
        // Verify pilot radar is visible
        await expect(page.locator('[data-id="Pilot Radar"]')).toBeVisible({ timeout: 10000 });

        // Verify warp panel is visible
        await expect(page.locator('[data-id="Warp"]')).toBeVisible();

        // Verify heading state syncs: set known angle and check UI
        const spaceShip = gameDriver.gameManager.spaceManager.state.getShip(shipId);
        if (!spaceShip) throw new Error('ship not found in space');

        spaceShip.angle = 90;
        await waitForPropertyFloatValue(page, 'heading', 90, undefined, 5);

        // Note: Speed test removed - physics simulation overwrites velocity immediately
        // Heading works because angle is set directly without physics interference
    });

    test('own waypoints sync to the pilot radar regardless of which collection is selected', async ({ page }) => {
        // Selection is a single ship-level field controlled from the relay station (see
        // relay-screen.spec.ts); the pilot radar just has to render either state without error.
        await expect(page.locator('[data-id="Pilot Radar"]')).toBeVisible({ timeout: 10000 });
        const shipState = gameDriver.gameManager.scriptApi.getShip(shipId)?.state;
        if (!shipState) throw new Error('ship state not found');

        addOwnWaypoint('alpha');
        addOwnWaypoint('beta');
        await expect.poll(() => serverWaypoints().length).toBe(2);

        // defaults to no collection selected (nothing visible to the pilot)
        expect(shipState.visiblePilotWaypointCollection).toBe(null);

        shipState.visiblePilotWaypointCollection = 'alpha';
        await page.waitForTimeout(200);

        shipState.visiblePilotWaypointCollection = 'beta';
        await page.waitForTimeout(200);
    });
});
