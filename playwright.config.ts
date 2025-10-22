import { PlaywrightTestConfig, devices } from '@playwright/test';

const config: PlaywrightTestConfig = {
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? [['list'], ['junit', { outputFile: 'playwright-results.xml' }]] : 'list',
    testMatch: 'modules/e2e/**/*.spec.ts',
    // Optimize timeouts for faster test execution
    timeout: 20000, // 20s per test (allows for setup + test + cleanup)
    // Enable parallel execution across test files (not within files due to server constraint)
    // Each worker runs tests from different files in parallel
    // Within a file, tests run serially to respect single-game-per-server constraint
    workers: 1,
    fullyParallel: false, // Tests within same file run serially (server limitation)
    use: {
        trace: 'on-first-retry',
        baseURL: `http://localhost:3000`,
        // Optimize action timeouts
        actionTimeout: 5000, // 5s for actions
        navigationTimeout: 10000, // 10s for navigation (initial page load can be slow)
        // Fail fast on page errors
        viewport: { width: 1280, height: 720 },
    },
    // Global expect timeout for assertions
    expect: {
        timeout: 5000, // 5s for expect assertions
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
