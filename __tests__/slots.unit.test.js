const { buildSlots, applySlot } = require('../src/services/nutrition/slots');
const { computeFromItems } = require('../src/services/nutrition/compute');

test('applySlot for rice_size changes quantity', () => {
  const items = [{ code: 'rice_cooked', qty_g: 150 }];
  const updated = applySlot(items, { key: 'rice_size', value: 300 });
  expect(updated.find((it) => it.code === 'rice_cooked').qty_g).toBe(300);
});

test('applySlot for pork_cut changes code', () => {
  const items = [{ code: 'pork_loin_cutlet', qty_g: 120 }];
  const updated = applySlot(items, { key: 'pork_cut', value: 'ヒレ' });
  expect(updated.find((it) => it.code.includes('pork')).code).toBe(
    'pork_fillet_cutlet',
  );
});

test('slots integration with compute: changing slots affects calories', () => {
  let items = [
    { code: 'pork_loin_cutlet', qty_g: 120, include: true },
    { code: 'rice_cooked', qty_g: 200, include: true },
  ];
  const initial = computeFromItems(items);

  const riceUpdatedItems = applySlot(items, { key: 'rice_size', value: 300 });
  const riceUpdated = computeFromItems(riceUpdatedItems);
  expect(riceUpdated.kcal).toBeGreaterThan(initial.kcal);

  const porkUpdatedItems = applySlot(riceUpdatedItems, {
    key: 'pork_cut',
    value: 'ヒレ',
  });
  const porkUpdated = computeFromItems(porkUpdatedItems);
  expect(porkUpdated.kcal).toBeLessThan(riceUpdated.kcal);
});
