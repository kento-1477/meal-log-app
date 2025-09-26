const { DEFAULT_MAX_KCAL, cloneTotals, roundTotals } = require('../types');

function sanitizeNumber(
  value,
  { min = 0, max = Number.POSITIVE_INFINITY } = {},
) {
  if (!Number.isFinite(value)) return 0;
  if (Number.isNaN(value)) return 0;
  return Math.min(Math.max(value, min), max);
}

function sanitizeTotals(totals, { maxKcal = DEFAULT_MAX_KCAL } = {}) {
  const cloned = cloneTotals(totals);
  cloned.kcal = sanitizeNumber(cloned.kcal, { min: 0, max: maxKcal });
  cloned.protein_g = sanitizeNumber(cloned.protein_g, { min: 0 });
  cloned.fat_g = sanitizeNumber(cloned.fat_g, { min: 0 });
  cloned.carbs_g = sanitizeNumber(cloned.carbs_g, { min: 0 });
  return roundTotals(cloned);
}

function sanitizeItems(items = []) {
  return items
    .map((item) => ({
      name: item.name ?? null,
      code: item.code ?? null,
      source: item.source ?? null,
      grams: Number.isFinite(item.grams) && item.grams > 0 ? item.grams : null,
      kcal: Number.isFinite(item.kcal) && item.kcal > 0 ? item.kcal : null,
      protein_g:
        Number.isFinite(item.protein_g) && item.protein_g > 0
          ? item.protein_g
          : null,
      fat_g: Number.isFinite(item.fat_g) && item.fat_g > 0 ? item.fat_g : null,
      carbs_g:
        Number.isFinite(item.carbs_g) && item.carbs_g > 0 ? item.carbs_g : null,
      confidence:
        Number.isFinite(item.confidence) && item.confidence >= 0
          ? Math.min(item.confidence, 1)
          : null,
      note: item.note ?? null,
    }))
    .filter((item) => item.name || item.code || item.grams || item.kcal);
}

function sanitize(payload, options = {}) {
  const maxKcal = options.maxKcal ?? DEFAULT_MAX_KCAL;
  const totals = sanitizeTotals(payload.totals, { maxKcal });
  const items = sanitizeItems(payload.items);
  const warnings = Array.isArray(payload.warnings)
    ? [
        ...new Set(
          payload.warnings.filter((w) => typeof w === 'string' && w.length),
        ),
      ]
    : [];
  const confidence = Number.isFinite(payload.confidence)
    ? Math.min(Math.max(payload.confidence, 0), 1)
    : null;
  const meta =
    payload.meta && typeof payload.meta === 'object' ? payload.meta : {};

  return {
    dish: payload.dish ?? null,
    totals,
    items,
    warnings,
    confidence,
    meta,
  };
}

module.exports = { sanitize };
