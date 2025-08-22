const { computeFromItems } = require('../src/services/nutrition/compute');

test('rice size impact', () => {
  const base = [{ code: 'rice_cooked', qty_g: 150, include: true }];
  const r150 = computeFromItems(base);
  const r300 = computeFromItems([{ ...base[0], qty_g: 300 }]);
  expect(r300.kcal).toBeGreaterThan(r150.kcal);
});

test('loin vs fillet', () => {
  const loin = computeFromItems([
    { code: 'pork_loin_cutlet', qty_g: 120, include: true },
  ]);
  const fillet = computeFromItems([
    { code: 'pork_fillet_cutlet', qty_g: 120, include: true },
  ]);
  expect(loin.kcal).toBeGreaterThan(fillet.kcal);
});

test('reconcile 4/9/4', () => {
  const out = computeFromItems([
    { code: 'rice_cooked', qty_g: 200, include: true },
  ]);
  const rule = Math.round(out.P * 4 + out.F * 9 + out.C * 4);
  expect(Math.abs(out.kcal - rule)).toBeLessThanOrEqual(Math.ceil(rule * 0.15));
});
