// NUTRI_BREAKDOWN_START slots.js
const { FOOD_BY_CODE: _FOOD_BY_CODE } = require('./compute.js');

function buildSlots(items) {
  const rice = items.find((it) => it.code === 'rice_cooked');
  const riceSelected = rice?.qty_g ?? 200;
  const riceSlot = {
    key: 'rice_size',
    question: 'ご飯の量は？',
    options: [150, 200, 300],
    selected: riceSelected,
    unit: 'g',
  };

  const pork = items.find((it) => it.code?.includes('pork_'));
  const porkSelected = pork?.code === 'pork_fillet_cutlet' ? 'ヒレ' : 'ロース';
  const porkSlot = {
    key: 'pork_cut',
    question: '部位は？',
    options: ['ロース', 'ヒレ'],
    selected: porkSelected,
  };

  return { riceSlot, porkSlot };
}

function applySlot(items, { key, value }) {
  const cloned = JSON.parse(JSON.stringify(items));
  if (key === 'rice_size') {
    const idx = cloned.findIndex((it) => it.code === 'rice_cooked');
    if (idx >= 0) cloned[idx].qty_g = Number(value);
    else
      cloned.push({ code: 'rice_cooked', qty_g: Number(value), include: true });
  }
  if (key === 'pork_cut') {
    const idx = cloned.findIndex((it) => it.code?.includes('pork_'));
    const target = value === 'ヒレ' ? 'pork_fillet_cutlet' : 'pork_loin_cutlet';
    if (idx >= 0) cloned[idx].code = target;
    else cloned.push({ code: target, qty_g: 120, include: true });
  }
  return cloned;
}

module.exports = { buildSlots, applySlot };
// NUTRI_BREAKDOWN_END slots.js
