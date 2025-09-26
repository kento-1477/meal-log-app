const {
  DEFAULT_RECONCILE_TOLERANCE,
  roundTotals,
  cloneTotals,
} = require('../types');

function calcAtwater(totals) {
  return 4 * totals.protein_g + 9 * totals.fat_g + 4 * totals.carbs_g;
}

function reconcile(payload, options = {}) {
  const tolerance = options.tolerance ?? DEFAULT_RECONCILE_TOLERANCE;
  const totals = cloneTotals(payload.totals);
  const warnings = new Set(payload.warnings || []);

  const atwater = calcAtwater(totals);
  if (!Number.isFinite(atwater) || atwater <= 0) {
    return {
      ...payload,
      totals: roundTotals(totals),
      warnings: Array.from(warnings),
      meta: {
        ...payload.meta,
        atwater: { value: atwater, delta: totals.kcal },
      },
    };
  }

  const delta = totals.kcal - atwater;
  const deltaRatio = Math.abs(delta) / Math.max(atwater, 1);

  if (deltaRatio > tolerance) {
    const scale = totals.kcal > 0 ? totals.kcal / atwater : 1;
    totals.protein_g *= scale;
    totals.fat_g *= scale;
    totals.carbs_g *= scale;
    warnings.add('reconciled');
  }

  return {
    ...payload,
    totals: roundTotals(totals),
    warnings: Array.from(warnings),
    meta: {
      ...payload.meta,
      atwater: {
        value: calcAtwater(roundTotals(totals)),
        delta,
        ratio: deltaRatio,
      },
    },
  };
}

module.exports = { reconcile };
