import { Page, expect, test } from '@playwright/test';
import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { getPropertyValue, makeDriver, waitForShipCondition } from './driver';

import { JobStatus } from '@starwards/core';
import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

async function waitForRadarReady(page: Page) {
    await expect(page.locator('[data-id="Long Range Radar"]')).toBeVisible({ timeout: 10000 });
    // Scan Beam only renders once initScreen has awaited both drivers and wired input,
    // so its visibility is proof the page is ready for keypresses (not an arbitrary sleep).
    await expect(page.locator('[data-id="Scan Beam"]')).toBeVisible({ timeout: 10000 });
}

test.describe('Signals Screen', () => {
    test.beforeEach(async ({ page }) => {
        setupPageErrorHandlers(page);
        await gameDriver.gameManager.startGame(single_ship);
        await navigateToScreen(page, `/signals.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('displays long range radar', async ({ page }) => {
        await expect(page.locator('[data-id="Long Range Radar"]')).toBeVisible({ timeout: 10000 });
    });

    test('systems status panel lists the radar systems', async ({ page }) => {
        const statusPanel = page.locator('[data-id="Systems Status"]');
        await expect(statusPanel).toBeVisible({ timeout: 10000 });
        // one row per radar system (the ship carries an omni radar and a scan beam)
        await expect(statusPanel.getByText('Radar')).toHaveCount(2);
    });

    // --- Scan beam controls drive radars[1] (arc / direction) ---
    // The scan beam is the ship's second radar (radars[1]); its Signals-station
    // controls command /radars/1/bearingCommand and /radars/1/arc. The `d`/`a` keys
    // sweep the commanded bearing all the way around (KeysRangeConfig step 5), and the
    // mount swings toward it at its turn speed; `w` narrows the beam and `s` widens it.

    test('d key: the mount swings toward the commanded bearing', async ({ page }) => {
        await waitForRadarReady(page);

        const initial = gameDriver.getShip(shipId).state.radars[1].bearing;
        await page.keyboard.press('d');
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.radars[1].bearing > initial + 0.01,
            3000,
        );
    });

    test('a key: the commanded bearing sweeps past the end of its range and around', async ({ page }) => {
        await waitForRadarReady(page);

        // 40 steps of 5 degrees each takes the bearing 200 degrees anticlockwise from 0: past the
        // -180 end of the range, coming back around to +160. A range that stopped at its end would
        // be stuck at -180.
        for (let i = 0; i < 40; i++) {
            await page.keyboard.press('a');
        }
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => Math.abs(ship.state.radars[1].bearingCommand - 160) < 1,
            3000,
        );
    });

    test('w key: radars[1].arc narrows by one step', async ({ page }) => {
        await waitForRadarReady(page);

        const initial = gameDriver.getShip(shipId).state.radars[1].arc;
        await page.keyboard.press('w');
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.radars[1].arc < initial - 0.01,
            3000,
        );
    });

    // --- Signals Jobs panel: the station's view of the top of the job queue ---

    test('signals jobs panel shows the auto-created scan job for a new contact', async ({ page }) => {
        const panel = page.locator('[data-id="Signals Jobs"]');
        await expect(panel).toBeVisible({ timeout: 10000 });

        // a fresh contact in radar range gets an auto scan job, surfaced as the top of the queue
        // (created via the server's own command queue — a test-constructed schema instance would
        // fail colyseus' class-identity assertion)
        gameDriver.gameManager.spaceManager.state.createAsteroidCommands.push({
            position: { x: 1000, y: 0 },
            radius: 50,
        });
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.signals.jobs.length > 0,
            5000,
        );
        const [rock] = gameDriver.gameManager.spaceManager.state.getAll('Asteroid');
        // bare id, not "Asteroid <id>": the contact is still UFO, and a job label must not
        // classify what the player has not scanned
        await expect(panel.getByText(`SCAN ${rock.id}`)).toBeVisible({ timeout: 10000 });
        await expect(panel.getByText('progress')).toBeVisible();
    });

    // --- Target cycle: which contacts the ] / [ keys reach ---

    test('cycles onto an unidentified contact of any type, without disclosing what it is', async ({ page }) => {
        await waitForRadarReady(page);
        gameDriver.gameManager.spaceManager.state.createAsteroidCommands.push({
            position: { x: 1000, y: 0 },
            radius: 50,
        });
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.signals.jobs.length > 0,
            5000,
        );

        // the only contact in range is a rock: a ships-only cycle would have nothing to land on
        // the client may not have received the rock yet when the server-side job appears; retry
        // the keypress until the cycle has something to land on
        await expect(async () => {
            await page.keyboard.press(']');
            expect(await getPropertyValue(page, 'Distance', 'Target')).not.toEqual('—');
        }).toPass({ timeout: 10_000 });
        // …and landing on it must not classify it — the rock is still UFO
        expect(await getPropertyValue(page, 'Type', 'Target')).toEqual('UFO');
    });

    test('lists every queued job as a row, not only the in-progress job', async ({ page }) => {
        const panel = page.locator('[data-id="Signals Jobs"]');
        await expect(panel).toBeVisible({ timeout: 10000 });

        // three contacts in range: one gets the working slot, the other two queue behind it
        gameDriver.gameManager.spaceManager.state.createAsteroidCommands.push(
            { position: { x: 1000, y: 0 }, radius: 50 },
            { position: { x: 0, y: 1000 }, radius: 50 },
            { position: { x: -1000, y: 0 }, radius: 50 },
        );
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.signals.jobs.length >= 3,
            5000,
        );
        const jobs = gameDriver.getShip(shipId).state.signals.jobs;
        const active = jobs.find((j) => j.status === JobStatus.IN_PROGRESS);
        const queued = jobs.filter((j) => j.status === JobStatus.QUEUED);
        expect(active).toBeTruthy();
        expect(queued).toHaveLength(2);

        await expect(panel.getByText(`SCAN ${active!.targetId}`)).toBeVisible({ timeout: 10000 });
        await expect(panel.getByText('progress')).toBeVisible();
        for (const [i, job] of queued.entries()) {
            const row = panel.getByText(`SCAN ${job.targetId}`);
            await expect(row).toBeVisible({ timeout: 10000 });
            const value = row.locator('..').locator('input');
            await expect(value).toHaveValue(new RegExp(`QUEUED #${i + 1}`));
        }

        await page.screenshot({ path: 'test-results/screenshots/signals-jobs-queue.png' });
    });

    test('cancel on a queued row removes that job without disturbing the in-progress job', async ({ page }) => {
        const panel = page.locator('[data-id="Signals Jobs"]');
        await expect(panel).toBeVisible({ timeout: 10000 });

        gameDriver.gameManager.spaceManager.state.createAsteroidCommands.push(
            { position: { x: 1000, y: 0 }, radius: 50 },
            { position: { x: 0, y: 1000 }, radius: 50 },
        );
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.signals.jobs.length >= 2,
            5000,
        );
        const jobsBefore = gameDriver.getShip(shipId).state.signals.jobs;
        const active = jobsBefore.find((j) => j.status === JobStatus.IN_PROGRESS)!;
        const queuedJob = jobsBefore.find((j) => j.status === JobStatus.QUEUED)!;

        await expect(panel.getByText(`SCAN ${queuedJob.targetId}`)).toBeVisible({ timeout: 10000 });
        // render order is always active row first, then queued rows: with one of each, the
        // second Cancel button belongs to the queued row
        await panel.getByRole('button', { name: 'Cancel' }).nth(1).click();

        // the target stays visible, so a fresh job for it re-queues at the end (by design — see
        // signals-job-manager's updateScanJobs) — assert the cancelled job's own id is gone,
        // not that its target vanishes
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => !ship.state.signals.jobs.some((j) => j.id === queuedJob.id),
            5000,
        );
        expect(gameDriver.getShip(shipId).state.signals.jobs.some((j) => j.id === active.id)).toBe(true);
    });

    test('paused toggle halts job progress via /signals/jobsPaused', async ({ page }) => {
        const panel = page.locator('[data-id="Signals Jobs"]');
        await expect(panel).toBeVisible({ timeout: 10000 });

        gameDriver.gameManager.spaceManager.state.createAsteroidCommands.push({
            position: { x: 1000, y: 0 },
            radius: 50,
        });
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.signals.jobs.length > 0,
            5000,
        );

        expect(gameDriver.getShip(shipId).state.signals.jobsPaused).toBe(false);
        // the checkbox input itself is positioned off-screen by Tweakpane's styling; its
        // clickable wrapper is the parent element. Anchoring on role="checkbox" (a stable
        // web-platform selector) instead of a Tweakpane class name survives internal DOM changes
        await panel.getByRole('checkbox').locator('..').click();
        await waitForShipCondition(
            () => gameDriver.getShip(shipId),
            (ship) => ship.state.signals.jobsPaused,
            3000,
        );

        const progressAtPause = gameDriver.getShip(shipId).state.signals.jobs[0].progress;
        await page.waitForTimeout(1000);
        expect(gameDriver.getShip(shipId).state.signals.jobs[0].progress).toEqual(progressAtPause);
    });
});
