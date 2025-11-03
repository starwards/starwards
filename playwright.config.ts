import { PlaywrightTestConfig, devices } from '@playwright/test';

const config: PlaywrightTestConfig = {
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? [['list'], ['junit', { outputFile: 'playwright-results.xml' }]] : 'list',
    testMatch: 'modules/e2e/**/*.spec.ts',
    // Optimize timeouts for faster test execution
    // Increase timeouts in CI for weak machines
    timeout: process.env.CI ? 30_000 : 20_000,
    // Enable parallel execution across test files (not within files due to server constraint)
    // Each worker runs tests from different files in parallel
    // Within a file, tests run serially to respect single-game-per-server constraint
    workers: 1,
    fullyParallel: false, // Tests within same file run serially (server limitation)
    use: {
        trace: 'on-first-retry',
        baseURL: `http://localhost:3000`,
        // Optimize action timeouts
        // Increase in CI for slow machines (especially for canvas screenshot operations)
        actionTimeout: process.env.CI ? 10_000 : 5_000,
        navigationTimeout: process.env.CI ? 15_000 : 10_000,
        // Fail fast on page errors
        viewport: { width: 1280, height: 720 },
    },
    // Global expect timeout for assertions
    expect: {
        timeout: process.env.CI ? 10_000 : 5_000,
    },
    webServer: {
        command: 'npm run browser',
        url: 'http://localhost:3000/',
        timeout: 2 * 60 * 1000,
        reuseExistingServer: !process.env.CI,
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
};
export default config;
