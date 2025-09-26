const UNIT_TO_GRAMS = {
  g: 1,
  gram: 1,
  grams: 1,
  gr: 1,
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  cup: 240,
  piece: 50,
  pc: 50,
  slice: 30,
};

const UNIT_ALIASES = {
  グラム: 'g',
  ｇ: 'g',
  ミリリットル: 'ml',
  個: 'piece',
  枚: 'slice',
};

function normalizeUnit(unit = '') {
  const trimmed = unit.trim().toLowerCase();
  if (!trimmed) return null;
  if (UNIT_ALIASES[trimmed]) return UNIT_ALIASES[trimmed];
  return trimmed;
}

function parseServingSize(servingSize = '') {
  if (!servingSize) {
    return { text: '', quantity: null, unit: null, grams: null };
  }

  const normalized = String(servingSize).trim();
  const quantityMatch = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*(\D*)/);
  if (!quantityMatch) {
    return { text: normalized, quantity: null, unit: null, grams: null };
  }

  const quantity = Number(quantityMatch[1]);
  const unit = normalizeUnit(quantityMatch[2]);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { text: normalized, quantity: null, unit, grams: null };
  }

  let grams = null;
  if (unit && UNIT_TO_GRAMS[unit]) {
    grams = quantity * UNIT_TO_GRAMS[unit];
  }

  return {
    text: normalized,
    quantity,
    unit,
    grams: grams && Number.isFinite(grams) ? grams : null,
  };
}

module.exports = { parseServingSize };
