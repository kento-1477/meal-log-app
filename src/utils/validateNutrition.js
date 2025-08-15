// src/utils/validateNutrition.js

const NUTRITION_CONSTRAINTS = {
  calories: { min: 0, max: 3000 },
  protein_g: { min: 0, max: 300 },
  fat_g: { min: 0, max: 300 },
  carbs_g: { min: 0, max: 500 },
};

function validateAndNormalize(nutrition) {
  const normalized = { ...nutrition };

  for (const key in NUTRITION_CONSTRAINTS) {
    if (typeof normalized[key] !== 'number' || isNaN(normalized[key])) {
      normalized[key] = 0;
    }
    normalized[key] = Math.max(NUTRITION_CONSTRAINTS[key].min, normalized[key]);
    normalized[key] = Math.min(NUTRITION_CONSTRAINTS[key].max, normalized[key]);
    normalized[key] = Math.round(normalized[key] * 10) / 10; // Round to 1 decimal place
  }

  if (normalized.items && Array.isArray(normalized.items)) {
    normalized.items = normalized.items.slice(0, 3).map((item) => ({
      ...item,
      name: String(item.name || '').slice(0, 50),
      calories: Math.round((item.calories || 0) * 10) / 10,
      protein_g: Math.round((item.protein_g || 0) * 10) / 10,
      fat_g: Math.round((item.fat_g || 0) * 10) / 10,
      carbs_g: Math.round((item.carbs_g || 0) * 10) / 10,
    }));
  }

  return normalized;
}

module.exports = { validateAndNormalize };
