const { createGuardrailRunner } = require('../services/nutrition/guardrails');

function run(raw, context = {}) {
  const runner = createGuardrailRunner({ version: 'test' });
  return runner.run(raw, context);
}

describe('guardrails pipeline', () => {
  test('zero-floor lifts kcal above minimum and tags warning', () => {
    const result = run(
      {
        dish: 'カレー',
        totals: { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
        items: [],
        warnings: [],
        meta: {},
      },
      { inputText: 'カレーライス', minKcal: 120 },
    );
    expect(result.totals.kcal).toBeGreaterThanOrEqual(120);
    expect(result.warnings).toContain('zeroFloored');
    expect(result.meta.zeroFloored).toBe(true);
  });

  test('low-calorie beverages bypass zero-floor', () => {
    const result = run(
      {
        dish: '水',
        totals: { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
        items: [],
        warnings: [],
        meta: {},
      },
      { inputText: '水' },
    );
    expect(result.totals.kcal).toBe(0);
    expect(result.warnings).not.toContain('zeroFloored');
  });

  test('reconcile rescales macros when kcal mismatch exceeds tolerance', () => {
    const result = run(
      {
        dish: 'テスト',
        totals: { kcal: 100, protein_g: 5, fat_g: 5, carbs_g: 5 },
        items: [],
        warnings: [],
        meta: {},
      },
      { tolerance: 0.05 },
    );
    const atwater =
      4 * result.totals.protein_g +
      9 * result.totals.fat_g +
      4 * result.totals.carbs_g;
    const delta = Math.abs(result.totals.kcal - atwater);
    expect(delta / Math.max(atwater, 1)).toBeLessThanOrEqual(0.05);
  });
});
