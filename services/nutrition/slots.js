function buildSlots(items) {
  // Example: Returns slot definitions
  const riceSlot = {
    question: 'ご飯の量',
    key: 'rice_size',
    options: [150, 200, 300],
    unit: 'g',
  };
  const porkSlot = {
    question: '豚肉の種類',
    key: 'pork_cut',
    options: ['ロース', 'ヒレ'],
  };
  return { riceSlot, porkSlot };
}

function applySlot(items, { key, value }) {
  const out = items.map((x) => ({ ...x }));
  if (key === 'rice_size') {
    const idx = out.findIndex((i) => i.code === 'rice_cooked');
    if (idx >= 0) out[idx].qty_g = Number(value);
  } else if (key === 'pork_cut') {
    const idx = out.findIndex((i) => /^pork_.*cutlet/.test(i.code));
    if (idx >= 0)
      out[idx].code =
        value === 'ヒレ' ? 'pork_fillet_cutlet' : 'pork_loin_cutlet';
  }
  return out;
}

module.exports = { buildSlots, applySlot };
