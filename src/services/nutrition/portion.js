// src/services/nutrition/portion.js

const PORTION_MODIFIERS = [
  { pattern: /(大盛|大盛り|ラージ|large)/i, multiplier: 1.5 },
  { pattern: /(特盛|特盛り|エクストララージ|extra large)/i, multiplier: 1.8 },
  { pattern: /(メガ|mega)/i, multiplier: 2.0 },
  { pattern: /(ハーフ|半分|half)/i, multiplier: 0.7 },

  { pattern: /[xX×](\d+)/, multiplier: (match) => parseInt(match[1], 10) },
];

function applyPortionCorrection(text, nutrition) {
  let correctedNutrition = { ...nutrition };
  let multiplier = 1.0;
  let textWithoutModifiers = text;

  for (const modifier of PORTION_MODIFIERS) {
    const match = text.match(modifier.pattern);
    if (match) {
      multiplier =
        typeof modifier.multiplier === 'function'
          ? modifier.multiplier(match)
          : modifier.multiplier;
      textWithoutModifiers = text.replace(modifier.pattern, '').trim();
      break; // Apply only the first found modifier
    }
  }

  if (multiplier !== 1.0) {
    correctedNutrition.calories *= multiplier;
    correctedNutrition.protein_g *= multiplier;
    correctedNutrition.fat_g *= multiplier;
    correctedNutrition.carbs_g *= multiplier;

    // Adjust carbs for rice-related modifiers
    if (/ライス|ご飯/.test(textWithoutModifiers)) {
      correctedNutrition.carbs_g *= 1.2; // Extra boost for rice carbs
    }
  }

  return { correctedNutrition, textWithoutModifiers };
}

module.exports = { applyPortionCorrection };
