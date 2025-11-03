import * as path from 'path';

import { GameManager, server } from '@starwards/server';
import { Locator, Page, expect, test } from '@playwright/test';
import { ShipApi, limitPercision } from '@starwards/core';

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
    // const workerIndex = parseInt(process.env.TEST_WORKER_INDEX || '0');
    const port = 8080; //+ workerIndex;

    t.beforeAll(async () => {
        gameManager = new GameManager();
        serverInfo = await server(port, path.resolve(__dirname, '..', '..', '..', 'static'), gameManager);
    });
    t.afterAll(async () => {
        await serverInfo?.close();
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
        getShip(id: string) {
            const ship = this.gameManager.scriptApi.getShip(id);
            if (!ship) {
                throw new Error(`ship ${id} not found`);
            }
            return ship;
        },
    };
}

export class RadarDriver {
    constructor(public canvas: Locator) {}

    async getZoom() {
        return limitPercision(Number(await this.canvas.getAttribute('data-zoom')));
    }
    async setZoom(target: number) {
        const page = this.canvas.page();
        await this.canvas.hover();
        const f = 1000 * (target / (await this.getZoom()) - 1); // tightly coupled logic from Camera and radarWidget logic
        await page.mouse.wheel(0, -f);
        expect(await this.getZoom()).toEqual(target);
    }
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
 * Helper to setup multiple widgets at once
 * Reduces boilerplate and improves test readability
 * @param page Playwright page object
 * @param widgets Array of widget names (without 'menu-' prefix)
 */
export async function setupWidgets(page: Page, ...widgets: string[]): Promise<void> {
    const layoutContainer = page.locator('#layoutContainer');
    for (const widget of widgets) {
        await page.locator(`[data-id="menu-${widget}"]`).dragTo(layoutContainer);
    }
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
