import { PlaywrightTestConfig, devices } from '@playwright/test';

const config: PlaywrightTestConfig = {
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? [['list'], ['junit', { outputFile: 'playwright-results.xml' }]] : 'list',
    testMatch: 'modules/e2e/**/*.spec.ts',
    use: {
        trace: 'on-first-retry',
        baseURL: `http://localhost:80`,
    },
    webServer: {
        command: 'npm run browser',
        port: 80,
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
