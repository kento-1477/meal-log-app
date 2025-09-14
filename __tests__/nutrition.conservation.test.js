const { finalizeTotals } = require('../services/nutrition/policy');

test('rounding-only-once and atwater ≤2%', () => {
  const mid = { P: 23.47, F: 22.66, C: 20.28, kcal: 379.8 };
  const { total, atwater } = finalizeTotals(mid);
  expect(total.P).toBeCloseTo(23.5, 1);
  expect(total.kcal).toBe(380);
  expect(Math.abs(atwater.delta)).toBeLessThanOrEqual(0.02);
});

test('fried dish returns range', () => {
  const mid = { P: 20, F: 20, C: 20, kcal: 380 };
  const min = { P: 20, F: 18, C: 20, kcal: 362 };
  const max = { P: 20, F: 23, C: 20, kcal: 407 };
  const { range } = finalizeTotals(mid, min, max);
  expect(range.kcal[0]).toBe(362);
  expect(range.kcal[1]).toBe(407);
});
