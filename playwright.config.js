const { defineConfig } = require('@playwright/test');

const baseURL = process.env.PLAYWRIGHT_BASE_URL || undefined;

module.exports = defineConfig({
  testDir: './tests/visual',
  timeout: 60000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.005,
      maxDiffPixels: 120,
    },
  },
  use: {
    baseURL,
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
});
