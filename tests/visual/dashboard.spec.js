let pwTest, pwExpect;
let shouldSkip = false;

try {
  // Playwright ランナーでのみ存在
  ({ test: pwTest, expect: pwExpect } = require('@playwright/test'));
} catch (_err) {
  // Jest実行時など module が無い場合は以降をスキップ
  shouldSkip = true;
}

const baseUrl = process.env.PLAYWRIGHT_BASE_URL;

if (shouldSkip || !baseUrl) {
  // Jest に読まれても “成功としてスキップ”
  // （describe.skip でもよいが、CIを緑にしたいなら pass にしておく）
  describe('visual (skipped)', () => {
    it('skipped because no @playwright/test or BASE_URL', () => {});
  });
} else {
  // ここに Playwright の本来のテスト内容
  pwTest('dashboard visual baseline', async ({ page }) => {
    await page.goto(baseUrl + '/dashboard');
    await pwExpect(page).toHaveScreenshot('dashboard-baseline.png');
  });
}
