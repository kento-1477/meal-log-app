#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const cases = [
  {
    fixture: 'fixtures/ci_dual_write.json',
    expectPass: true,
  },
  {
    fixture: 'fixtures/100_cases.json',
    expectPass: true,
  },
  {
    fixture: 'fixtures/ci_dual_write_fail.json',
    expectPass: false,
  },
];

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'pipe', ...opts });
  return {
    code: res.status,
    stdout: res.stdout?.toString() ?? '',
    stderr: res.stderr?.toString() ?? '',
  };
}

function main() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'golem-'));
  let failed = false;

  cases.forEach(({ fixture, expectPass }) => {
    const absFixture = resolve(process.cwd(), fixture);
    const outPath = join(
      tempRoot,
      `${fixture.replace(/[^a-z0-9]/gi, '_')}.diffs.json`,
    );

    const sim = run('node', [
      'scripts/simulate_dual_write.js',
      absFixture,
      '--write-diffs',
      outPath,
    ]);
    if (sim.code !== 0 || !existsSync(outPath)) {
      console.error(
        `simulate_dual_write failed for ${fixture}\n${sim.stderr || sim.stdout}`,
      );
      failed = true;
      return;
    }

    const check = run('node', ['scripts/check_diffs.js', outPath]);
    const passed = check.code === 0;
    if (passed !== expectPass) {
      failed = true;
      const expectation = expectPass ? 'no breaches' : 'breach detection';
      console.error(
        `Unexpected result for ${fixture}: expected ${expectation}\n${check.stderr || check.stdout}`,
      );
    } else {
      console.log(`OK ${fixture} (${expectPass ? 'pass' : 'fail'} case)`);
    }
  });

  rmSync(tempRoot, { recursive: true, force: true });

  if (failed) {
    process.exit(1);
  }
}

main();
