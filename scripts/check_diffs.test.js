const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

describe('check_diffs CLI', () => {
  const simulatePath = path.resolve(__dirname, 'simulate_dual_write.js');
  const checkPath = path.resolve(__dirname, 'check_diffs.js');
  const tmpDir = path.resolve(__dirname, '../tmp');

  beforeAll(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir);
    }
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function runPipeline(fixture, outName) {
    const outFile = path.resolve(tmpDir, outName);
    const simResult = spawnSync(
      process.execPath,
      [simulatePath, fixture, '--write-diffs', outFile],
      {
        encoding: 'utf8',
      },
    );
    if (simResult.status !== 0) {
      throw new Error(`simulate_dual_write failed: ${simResult.stderr}`);
    }
    const checkResult = spawnSync(process.execPath, [checkPath, outFile], {
      encoding: 'utf8',
    });
    return checkResult;
  }

  it('returns zero exit when diffs stay within thresholds', () => {
    const fixture = path.resolve(__dirname, '../fixtures/ci_dual_write.json');
    const { status, stderr } = runPipeline(fixture, 'success.json');
    expect(status).toBe(0);
    expect(stderr).toBe('');
  });

  it('returns non-zero exit when diffs exceed thresholds', () => {
    const fixture = path.resolve(
      __dirname,
      '../fixtures/ci_dual_write_fail.json',
    );
    const { status, stderr } = runPipeline(fixture, 'fail.json');
    expect(status).toBe(1);
    expect(stderr).toContain('Diff threshold breaches detected');
  });
});
