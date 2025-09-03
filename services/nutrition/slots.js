function buildSlots(items = []) {
  const slots = {};

  const hasRice = items.some((it) => it.code === 'rice_cooked');
  if (hasRice) {
    const rice = items.find((it) => it.code === 'rice_cooked');
    slots.rice_size = {
      key: 'rice_size',
      question: 'ご飯の量は？',
      options: [150, 200, 300],
      selected: rice?.qty_g ?? 200,
      unit: 'g',
    };
  }

  const hasPork = items.some((it) => (it.code || '').startsWith('pork_'));
  if (hasPork) {
    const pork = items.find((it) => (it.code || '').startsWith('pork_'));
    const selected = pork?.code === 'pork_fillet_cutlet' ? 'ヒレ' : 'ロース';
    slots.pork_cut = {
      key: 'pork_cut',
      question: '部位は？',
      options: ['ロース', 'ヒレ'],
      selected,
    };
  }

  return slots;
}

function applySlot(items, { key, value }) {
  const out = items.map((x) => ({ ...x }));
  if (key === 'rice_size') {
    const idx = out.findIndex((i) => i.code === 'rice_cooked');
    if (idx >= 0) out[idx].qty_g = Number(value);
  } else if (key === 'pork_cut') {
    const v = String(value).trim().toLowerCase();
    const isFillet = ['ヒレ', 'ﾋﾚ', 'ﾌｨﾚ', 'フィレ', 'fillet', 'filet'].some(
      (s) => s.toLowerCase() === v,
    );
    const target = isFillet ? 'pork_fillet_cutlet' : 'pork_loin_cutlet';

    const idx = out.findIndex((it) => (it.code || '').startsWith('pork_'));
    if (idx >= 0) {
      out[idx].code = target;
    } else {
      out.push({ code: target, qty_g: 120, include: true });
    }
  }
  return out;
}

module.exports = { buildSlots, applySlot };
