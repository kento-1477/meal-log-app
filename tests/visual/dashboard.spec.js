const { test, expect } = require('@playwright/test');

const shouldSkip = !process.env.PLAYWRIGHT_BASE_URL;

test.describe('Visual Regression', () => {
  test.skip(
    shouldSkip,
    'PLAYWRIGHT_BASE_URL not configured - skipping visual regression baseline.',
  );

  test('dashboard baseline', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot('dashboard-baseline.png');
  });
});
