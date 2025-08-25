const geminiProvider = require('./providers/geminiProvider');
const { computeFromItems } = require('./compute');
const { buildSlots } = require('./slots');

async function realAnalyze(input) {
  const aiEnabled =
    process.env.ENABLE_AI === 'true' || process.env.GEMINI_MOCK === '1';
  const useGemini =
    process.env.AI_PROVIDER === 'gemini' || process.env.GEMINI_MOCK === '1';

  if (aiEnabled && useGemini) {
    try {
      console.log('Attempting analysis with Gemini...');
      return await geminiProvider.analyze(input); // GEMINI_MOCK=1 ならモックが返る
    } catch (_error) {
      console.error(
        'Gemini analysis failed, falling back to deterministic.',
        _error,
      );
      throw _error;
    }
  }
  console.log('AI analysis is not enabled or provider is not Gemini.');
  throw new Error('AI not configured');
}

async function analyze(input) {
  let aiResult;
  try {
    aiResult = await realAnalyze(input);
  } catch (_error) {
    console.log('realAnalyze failed, using deterministic fallback.');
    const text = input.text || '';
    const items = [];
    if (/とんかつ|トンカツ/i.test(text)) {
      items.push({ code: 'pork_loin_cutlet', qty_g: 120, include: true });
      items.push({ code: 'rice_cooked', qty_g: 200, include: true });
    } else if (text) {
      items.push({ name: text, qty: 1, unit: 'piece' });
    }
    aiResult = {
      dish: text || '食事',
      confidence: 0.5,
      items,
    };
  }

  if (aiResult && typeof aiResult.calories === 'number') {
    return {
      dish: aiResult.dish,
      confidence: aiResult.confidence ?? 0.6,
      nutrition: {
        protein_g: aiResult.protein_g ?? 0,
        fat_g: aiResult.fat_g ?? 0,
        carbs_g: aiResult.carbs_g ?? 0,
        calories: aiResult.calories ?? 0,
      },
      breakdown: {
        items: aiResult.items ?? [],
        slots: {
          rice_size: buildSlots(aiResult.items ?? []).riceSlot,
          pork_cut: buildSlots(aiResult.items ?? []).porkSlot,
        },
        warnings: [],
      },
      snapshot: {
        used_food_codes: (aiResult.items ?? [])
          .map((i) => i.code)
          .filter(Boolean),
      },
    };
  }

  const {
    P,
    F,
    C,
    kcal,
    warnings,
    items: normItems,
  } = computeFromItems(aiResult.items || []);
  const s = buildSlots(normItems);
  const slots = { rice_size: s.riceSlot, pork_cut: s.porkSlot };

  return {
    dish: aiResult.dish,
    confidence: aiResult.confidence,
    nutrition: { protein_g: P, fat_g: F, carbs_g: C, calories: kcal },
    breakdown: {
      items: normItems,
      slots,
      warnings,
    },
    snapshot: { used_food_codes: normItems.map((i) => i.code) },
  };
}

async function analyzeLegacy(input) {
  return analyze(input);
}

module.exports = { analyze, analyzeLegacy };
