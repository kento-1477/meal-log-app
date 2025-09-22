#!/usr/bin/env node
const { spawnSync } = require('child_process');

try {
  require.resolve('@playwright/test');
} catch (err) {
  console.error('\n[@meal-log] Playwright dependency not found.');
  console.error(
    'Run: npm install -D @playwright/test && npx playwright install --with-deps',
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const result = spawnSync('npx', ['playwright', 'test', ...args], {
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status ?? 1);
