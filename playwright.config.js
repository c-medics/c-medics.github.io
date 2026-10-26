const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    workers: 2,
    use: { baseURL: 'http://127.0.0.1:8766' },
    webServer: {
        command: 'node tests/serve.cjs',
        url: 'http://127.0.0.1:8766/quotation.html'
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
        { name: 'small-mobile-webkit', use: { ...devices['iPhone SE'] } },
        { name: 'landscape-mobile-webkit', use: { ...devices['iPhone 13 landscape'] } }
    ]
});
