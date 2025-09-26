const DEFAULT_MIN_KCAL = Number(process.env.GUARD_KCAL_MIN || 120);
const DEFAULT_MAX_KCAL = Number(process.env.GUARD_KCAL_MAX || 2000);
const DEFAULT_RECONCILE_TOLERANCE = Number(
  process.env.RECONCILE_TOLERANCE || 0.1,
);

function cloneTotals(totals = {}) {
  return {
    kcal: Number(totals?.kcal ?? 0),
    protein_g: Number(totals?.protein_g ?? totals?.protein ?? 0),
    fat_g: Number(totals?.fat_g ?? totals?.fat ?? 0),
    carbs_g: Number(totals?.carbs_g ?? totals?.carbs ?? 0),
  };
}

function roundTotals(totals) {
  return {
    kcal: Math.round(totals.kcal * 10) / 10,
    protein_g: Math.round(totals.protein_g * 10) / 10,
    fat_g: Math.round(totals.fat_g * 10) / 10,
    carbs_g: Math.round(totals.carbs_g * 10) / 10,
  };
}

module.exports = {
  DEFAULT_MIN_KCAL,
  DEFAULT_MAX_KCAL,
  DEFAULT_RECONCILE_TOLERANCE,
  cloneTotals,
  roundTotals,
};
