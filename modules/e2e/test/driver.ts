import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'path';

import { GameManager, server } from '@starwards/server';
import { Locator, Page, expect, test } from '@playwright/test';
import { ShipApi } from '@starwards/core';

async function expectServerHealthy(port: number) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 500);

    const response = await fetch(`http://localhost:${port}/health`, {
        signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (!response.ok) {
        throw new Error(`Game server on port ${port} is not healthy.`);
    }
}

export function makeDriver(t: typeof test) {
    let gameManager: GameManager | null = null;
    let serverInfo: Awaited<ReturnType<typeof server>> | null = null;
    let port = 8080;
    let recordingsDir = '';

    // eslint-disable-next-line no-empty-pattern
    t.beforeAll(async ({}, workerInfo) => {
        // Each worker gets a unique port for parallel execution
        port = 8080 + workerInfo.parallelIndex;
        gameManager = new GameManager();
        recordingsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'starwards-e2e-recordings-'));
        // Serve browser build from modules/browser/dist, static assets from static/
        const browserDistPath = path.resolve(__dirname, '..', '..', 'browser', 'dist');
        const staticAssetsPath = path.resolve(__dirname, '..', '..', '..', 'static');
        serverInfo = await server(port, [browserDistPath, staticAssetsPath], gameManager, undefined, recordingsDir);
    });
    t.afterAll(async () => {
        await serverInfo?.close();
        await fs.rm(recordingsDir, { recursive: true, force: true });
    });
    t.beforeEach(async () => {
        await expectServerHealthy(port);
    });
    t.afterEach(async () => {
        // Defensive stopGame - don't let cleanup errors crash the server
        try {
            if (gameManager) {
                // Add timeout to prevent hanging
                const stopPromise = gameManager.stopGame();
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('stopGame timeout')), 5000),
                );
                await Promise.race([stopPromise, timeoutPromise]);
            }
        } catch (error) {
            // Log but don't throw - we don't want cleanup errors to crash the server
            // eslint-disable-next-line no-console
            console.error('Error stopping game (non-fatal):', error);
        }
    });
    return {
        get gameManager(): GameManager {
            if (!gameManager) throw new Error('missing gameManager');
            return gameManager;
        },
        get port(): number {
            return port;
        },
        get baseURL(): string {
            return `http://localhost:${port}`;
        },
        getShip(id: string) {
            const ship = this.gameManager.scriptApi.getShip(id);
            if (!ship) {
                throw new Error(`ship ${id} not found`);
            }
            return ship;
        },
    };
}

/**
 * Helper to wait for a condition on ship state
 */
export async function waitForShipCondition(
    getShipFn: () => ShipApi,
    condition: (ship: ShipApi) => boolean,
    timeout = 2000,
): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        const ship = getShipFn();
        if (condition(ship)) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timeout waiting for ship condition`);
}

/**
 * Get a Tweakpane property value by its label text
 * Works with PropertyPanel inputs that use label + input structure
 * @param page Playwright page object
 * @param labelText The exact text of the label (e.g., 'heading', 'speed')
 * @param panelTitle Optional title of the folder/panel containing the property (for disambiguation)
 * @returns The input value as a string
 */
export async function getPropertyValue(page: Page, labelText: string, panelTitle?: string): Promise<string> {
    if (panelTitle) {
        // Find the widget container that has the panel title
        // Tweakpane widgets are typically in divs with data-id or class attributes
        const widgetContainer = page.locator(`[data-id="${panelTitle}"], div:has-text("${panelTitle}")`).first();
        await expect(widgetContainer).toBeVisible();

        const label = widgetContainer.getByText(labelText, { exact: true });
        await expect(label).toBeVisible();
        const container = label.locator('..');
        const input = container.locator('input');
        const dataSetValue = await input.getAttribute('data-value');
        if (dataSetValue) {
            return dataSetValue;
        }
        return await input.inputValue();
    } else {
        const label = page.getByText(labelText, { exact: true });
        await expect(label).toBeVisible();
        const container = label.locator('..');
        const input = container.locator('input');
        const dataSetValue = await input.getAttribute('data-value');
        if (dataSetValue) {
            return dataSetValue;
        }
        return await input.inputValue();
    }
}

/**
 * Wait for a Tweakpane property to match a condition
 * @param page Playwright page object
 * @param labelText The exact text of the label (e.g., 'heading', 'speed')
 * @param condition Function that returns true when the value is correct
 * @param panelTitle Optional title of the folder/panel containing the property (for disambiguation)
 * @param timeout Maximum time to wait in milliseconds
 */
export async function waitForPropertyValue(
    page: Page,
    labelText: string,
    condition: (value: string) => boolean,
    panelTitle?: string,
    timeout = 2000,
): Promise<string> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        const value = await getPropertyValue(page, labelText, panelTitle);
        if (condition(value)) {
            return value;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const finalValue = await getPropertyValue(page, labelText, panelTitle);
    const panelInfo = panelTitle ? ` in panel '${panelTitle}'` : '';
    throw new Error(
        `Timeout waiting for property '${labelText}'${panelInfo} to match condition. Final value: ${finalValue}`,
    );
}

/**
 * Wait for a Tweakpane numeric property to reach a specific value
 * @param page Playwright page object
 * @param labelText The exact text of the label (e.g., 'heading', 'speed')
 * @param expectedValue The expected numeric value
 * @param panelTitle Optional title of the folder/panel containing the property (for disambiguation)
 * @param tolerance How close the value needs to be (default: 0.1)
 * @param timeout Maximum time to wait in milliseconds
 * @returns The final numeric value
 */
export async function waitForPropertyFloatValue(
    page: Page,
    labelText: string,
    expectedValue: number,
    panelTitle?: string,
    tolerance = 0.1,
    timeout = 2000,
): Promise<number> {
    const value = await waitForPropertyValue(
        page,
        labelText,
        (v) => Math.abs(parseFloat(v) - expectedValue) < tolerance,
        panelTitle,
        timeout,
    );
    return parseFloat(value);
}

/**
 * Asserts a `.sw-bar` element (see addBarBlade/addBarCellToRow) renders as a non-interactive
 * level bar: the underlying slider's drag handle must be hidden.
 */
export async function expectNonInteractiveBar(bar: Locator): Promise<void> {
    await expect(bar).toBeVisible();
    const knobDisplay = await bar.evaluate((el) => {
        const knob = el.querySelector('.tp-sldv_k');
        return knob && getComputedStyle(knob, '::after').display;
    });
    expect(knobDisplay).toBe('none');
}
