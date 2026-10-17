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
        } else if (/colyseus|reconnect|refId|mismatch|connection/i.test(msg.text())) {
            // the sdk reports drops and auto-reconnects at warn/info level only
            // eslint-disable-next-line no-console
            console.error(`Browser console ${msg.type()}:`, msg.text());
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
    options: { timeout?: number; baseURL?: string } = {},
): Promise<void> {
    // default: the config's navigationTimeout (15s in CI); a fixed 5s failed loaded multi-page tests
    const timeout = options.timeout;
    const url = options.baseURL ? `${options.baseURL}${screenPath}` : screenPath;

    try {
        await page.goto(url, {
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
                `Navigation timeout - page did not load within ${timeout ? `${timeout}ms` : 'navigationTimeout'}. ` +
                    'Server may be hung or page may be waiting for WebSocket connection.',
            );
        }

        // Re-throw with original error
        throw error;
    }
}

/** Waits until the screen's InputManager has bound its hotkeys (`body[data-hotkeys]`), so key presses are not lost. */
export async function waitForHotkeys(page: Page, timeout = 15000): Promise<void> {
    await page.locator('body[data-hotkeys="bound"]').waitFor({ state: 'attached', timeout });
}
