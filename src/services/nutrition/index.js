// src/services/nutrition/index.js
// NUTRI_BREAKDOWN_START index.js
const {
  analyzeLegacy,
  analyzeBreakdown,
} = require('./providers/geminiProvider');
const { computeFromItems } = require('./compute');
const { buildSlots } = require('./slots');

async function analyze(input) {
  // 1. Try to get breakdown from new provider
  const ai = (await analyzeBreakdown(input)) || {};

  // 2. Fallback to a default item list if AI fails
  let items =
    ai.items && ai.items.length
      ? ai.items
      : [
          { code: 'pork_loin_cutlet', qty_g: 120, include: true },
          { code: 'rice_cooked', qty_g: 200, include: true },
          { code: 'cabbage_raw', qty_g: 80, include: true },
          { code: 'miso_soup', qty_ml: 200, include: true },
          { code: 'tonkatsu_sauce', qty_g: 20, include: true },
        ];

  // 3. Compute deterministic nutrition from items
  const { P, F, C, kcal, warnings, items: normItems } = computeFromItems(items);

  // 4. Build suggestion slots
  const slots = buildSlots(normItems);

  // 5. Assemble the final payload for the API
  return {
    dish: ai.dish || '食事',
    confidence: ai.confidence ?? 0.6,
    nutrition: { protein_g: P, fat_g: F, carbs_g: C, calories: kcal },
    breakdown: {
      items: normItems,
      slots: { rice_size: slots.riceSlot, pork_cut: slots.porkSlot },
      warnings,
    },
    snapshot: { used_food_codes: normItems.map((i) => i.code) },
  };
}

module.exports = { analyze, analyzeLegacy }; // Also export legacy for other uses if needed
// NUTRI_BREAKDOWN_END index.js

module.exports = { analyze };
