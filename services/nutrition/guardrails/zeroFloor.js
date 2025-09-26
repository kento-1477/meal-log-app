const {
  DEFAULT_MIN_KCAL,
  DEFAULT_MAX_KCAL,
  cloneTotals,
  roundTotals,
} = require('../types');

const BASE_LOW_CAL_REGEX =
  /(?:水|お茶|ブラックコーヒー|緑茶|ほうじ茶|麦茶|sparkling\s*water|water|black\s*coffee|ゼロカロリー|diet\s+cola|ソーダ水)/iu;
const LOW_CAL_EXTRA = (process.env.LOW_CAL_REGEX_EXTRA || '').trim();
const LOW_CAL_REGEX = LOW_CAL_EXTRA
  ? new RegExp(`${BASE_LOW_CAL_REGEX.source}|${LOW_CAL_EXTRA}`, 'iu')
  : BASE_LOW_CAL_REGEX;

function allowLowCalorie(context = {}) {
  const text = [context.inputText, context.dish]
    .filter((s) => typeof s === 'string')
    .join(' ');
  if (!text) return false;
  return LOW_CAL_REGEX.test(text);
}

function distributeMacros(totalKcal, existing) {
  const totals = cloneTotals(existing);
  const macroCalories =
    4 * totals.protein_g + 9 * totals.fat_g + 4 * totals.carbs_g;

  if (macroCalories > 0) {
    const scale = totalKcal / macroCalories;
    totals.protein_g *= scale;
    totals.fat_g *= scale;
    totals.carbs_g *= scale;
    return totals;
  }

  const proteinKcal = totalKcal * 0.3;
  const fatKcal = totalKcal * 0.35;
  const carbKcal = totalKcal - proteinKcal - fatKcal;

  totals.protein_g = proteinKcal / 4;
  totals.fat_g = fatKcal / 9;
  totals.carbs_g = carbKcal / 4;
  return totals;
}

function zeroFloor(payload, options = {}) {
  const minKcal = Number(options.minKcal ?? DEFAULT_MIN_KCAL);
  const maxKcal = Number(options.maxKcal ?? DEFAULT_MAX_KCAL);

  const totals = cloneTotals(payload.totals);
  const warnings = new Set(payload.warnings || []);
  const zeroFloored = Boolean(payload.meta?.zeroFloored);

  if (zeroFloored) {
    return payload;
  }

  if (allowLowCalorie({ inputText: options.inputText, dish: payload.dish })) {
    return {
      ...payload,
      totals: roundTotals({
        ...totals,
        kcal: Math.max(0, totals.kcal),
      }),
      warnings: Array.from(warnings),
    };
  }

  if (totals.kcal > minKcal) {
    return payload;
  }

  const flooredKcal = Math.min(Math.max(minKcal, totals.kcal), maxKcal);
  const redistributed = distributeMacros(flooredKcal, totals);
  redistributed.kcal = flooredKcal;
  warnings.add('zeroFloored');

  return {
    ...payload,
    totals: roundTotals(redistributed),
    warnings: Array.from(warnings),
    meta: {
      ...payload.meta,
      zeroFloored: true,
      zeroFloorAppliedAt: new Date().toISOString(),
    },
  };
}

module.exports = { zeroFloor, allowLowCalorie };
