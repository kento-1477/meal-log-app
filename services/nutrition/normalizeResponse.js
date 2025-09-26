function resolveTotals(base = {}) {
  return {
    kcal: Number(base?.totals?.kcal ?? base?.nutrition?.calories ?? 0) || 0,
    protein_g:
      Number(base?.totals?.protein_g ?? base?.nutrition?.protein_g ?? 0) || 0,
    fat_g: Number(base?.totals?.fat_g ?? base?.nutrition?.fat_g ?? 0) || 0,
    carbs_g:
      Number(base?.totals?.carbs_g ?? base?.nutrition?.carbs_g ?? 0) || 0,
  };
}

function normalizeAnalysisForResponse(base = {}) {
  const totals = resolveTotals(base);
  const rawBreakdown =
    base?.breakdown && typeof base.breakdown === 'object' ? base.breakdown : {};
  const items = Array.isArray(base.items)
    ? base.items
    : Array.isArray(rawBreakdown.items)
      ? rawBreakdown.items
      : [];
  const warnings = Array.isArray(rawBreakdown.warnings)
    ? rawBreakdown.warnings
    : Array.isArray(base.warnings)
      ? base.warnings
      : [];
  const breakdown = { ...rawBreakdown, items, warnings };

  return {
    ...base,
    totals,
    items,
    breakdown,
    nutrition: {
      calories: totals.kcal,
      protein_g: totals.protein_g,
      fat_g: totals.fat_g,
      carbs_g: totals.carbs_g,
    },
    meta: base.meta || {},
  };
}

module.exports = { normalizeAnalysisForResponse };
