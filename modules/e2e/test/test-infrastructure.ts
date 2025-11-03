import { Page } from '@playwright/test';

/**
 * Sets up page error handlers to detect crashes and errors early,
 * preventing tests from hanging indefinitely
 */
export function setupPageErrorHandlers(page: Page): void {
    // Detect page crashes to fail fast instead of hanging
    page.on('crash', () => {
        throw new Error('Page crashed during test');
    });

    // Log page errors for debugging (but don't fail the test)
    page.on('pageerror', (error) => {
        // eslint-disable-next-line no-console
        console.error('Page error during test:', error.message);
    });

    // Log console errors for debugging
    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            // eslint-disable-next-line no-console
            console.error('Browser console error:', msg.text());
        }
    });
}

/**
 * Cleans up page state after test to prevent issues from cascading to subsequent tests
 */
export async function cleanupPageState(page: Page): Promise<void> {
    try {
        // Clear any timers or intervals that might be running in the browser
        await page
            .evaluate(() => {
                // In browser context, setTimeout returns a number
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const highestId = setTimeout(() => {}, 0) as unknown as number;
                for (let i = 0; i < highestId; i++) {
                    clearTimeout(i);
                    clearInterval(i);
                }
            })
            .catch(() => {
                // Page might be closed or navigated away, ignore
            });
    } catch (error) {
        // Ignore cleanup errors - test already finished
        // eslint-disable-next-line no-console
        console.error('Error during test cleanup:', error);
    }
}

/**
 * Navigates to a screen with proper timeout and error handling
 * Detects server connection failures early
 */
export async function navigateToScreen(
    page: Page,
    screenPath: string,
    options: { timeout?: number } = {},
): Promise<void> {
    const timeout = options.timeout ?? 5000;

    try {
        await page.goto(screenPath, {
            timeout,
            waitUntil: 'domcontentloaded',
        });

        await page.waitForLoadState('domcontentloaded');
    } catch (error) {
        const errorMessage = String(error);

        // Detect server connection failures
        if (
            errorMessage.includes('ECONNREFUSED') ||
            errorMessage.includes('ERR_CONNECTION_REFUSED') ||
            errorMessage.includes('net::ERR_CONNECTION_REFUSED')
        ) {
            throw new Error(
                'Game server not responding (ECONNREFUSED). ' +
                    'Server may have crashed. Check console for "Error stopping game" messages.',
            );
        }

        // Detect timeout while waiting for server
        if (errorMessage.includes('Timeout') && errorMessage.includes('exceeded')) {
            throw new Error(
                `Navigation timeout - page did not load in ${timeout}ms. ` +
                    'Server may be hung or page may be waiting for WebSocket connection.',
            );
        }

        // Re-throw with original error
        throw error;
    }
}

/**
 * Waits for a critical element with fail-fast behavior
 * Throws immediately if page crashes or becomes unresponsive
 */
export async function waitForCriticalElement(
    page: Page,
    selector: string,
    options: { timeout?: number } = {},
): Promise<void> {
    const timeout = options.timeout ?? 10000;
    let crashed = false;

    // Set up one-time crash handler
    const crashHandler = () => {
        crashed = true;
    };
    page.once('crash', crashHandler);

    try {
        // Poll for element with crash detection
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            if (crashed) {
                throw new Error('Page crashed while waiting for critical element');
            }

            const element = page.locator(selector);
            const isVisible = await element.isVisible().catch(() => false);

            if (isVisible) {
                return;
            }

            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        throw new Error(`Timeout waiting for critical element: ${selector}`);
    } finally {
        page.off('crash', crashHandler);
    }
}
