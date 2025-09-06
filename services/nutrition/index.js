const geminiProvider = require('./providers/geminiProvider');
const { computeFromItems } = require('./compute');
const { buildSlots } = require('./slots');
const { findArchetype } = require('./archetypeMatcher');
const { resolveNames } = require('./nameResolver');

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
    aiResult.landing_type = aiResult.landing_type || 'ai_exact';
  } catch (_error) {
    // If AI provider itself fails, set a default empty structure
    aiResult = {
      dish: input.text || '食事',
      confidence: 0,
      items: [],
      landing_type: 'ai_error',
    };
  }

  // If AI returns no items, try to find an archetype
  if (aiResult && aiResult.items && aiResult.items.length === 0) {
    const archetypeResult = findArchetype(input.text);
    if (archetypeResult) {
      console.log(
        `AI result was empty, using archetype '${archetypeResult.archetype_id}'`,
      );
      aiResult = archetypeResult; // Replace AI result with archetype result
    }
  }

  // If still no items, try the final deterministic keyword fallback
  if (aiResult && aiResult.items && aiResult.items.length === 0) {
    console.log('Falling back to deterministic keywords.');
    const text = input.text || '';
    let items = [];
    // This is a deterministic fallback for when AI analysis fails.
    // All items created here are unconfirmed and should be marked as pending.
    if (/カツ丼|とんかつ|トンカツ/i.test(text)) {
      items = [
        { code: 'pork_loin_cutlet', qty_g: 120, include: true, pending: true },
        { code: 'rice_cooked', qty_g: 200, include: true, pending: true },
      ];
    } else if (/ハンバーグ/i.test(text)) {
      items = [
        { code: 'hamburger_steak', qty_g: 150, include: true, pending: true },
        { code: 'rice_cooked', qty_g: 200, include: true, pending: true },
      ];
    } else if (/カレー|カレーライス/i.test(text)) {
      items = [
        { code: 'curry_rice', qty_g: 300, include: true, pending: true },
      ];
    }

    // Fallback for "Teishoku" (set meal) to add pending rice
    if (items.length === 0 && /(定食|teishoku)/i.test(text)) {
      items = [
        { code: 'rice_cooked', qty_g: 200, include: true, pending: true },
      ];
    }
    // Overwrite aiResult with fallback results
    aiResult = {
      dish: text || '食事',
      confidence: 0,
      items,
      landing_type: 'fallback_keyword',
    };
  }

  if (aiResult && typeof aiResult.calories === 'number') {
    const slots = buildSlots(aiResult.items ?? []);
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
        slots,
        warnings: aiResult.warnings ?? [],
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
  const slots = buildSlots(normItems, aiResult.archetype_id);
  const resolvedItems = resolveNames(normItems);

  aiResult.base_confidence = aiResult.base_confidence ?? aiResult.confidence;
  // If any items are pending, the overall confidence must be 0.
  if (resolvedItems.some((i) => i.pending)) {
    aiResult.confidence = 0;
  }

  return {
    dish: aiResult.dish,
    confidence: aiResult.confidence,
    base_confidence: aiResult.base_confidence, // Add base_confidence here
    archetype_id: aiResult.archetype_id, // Pass through the archetype_id if it exists
    landing_type: aiResult.landing_type, // Pass through the landing_type
    nutrition: { protein_g: P, fat_g: F, carbs_g: C, calories: kcal },
    breakdown: {
      items: resolvedItems,
      slots,
      warnings: warnings,
    },
  };
}

async function analyzeLegacy(input) {
  return analyze(input);
}

module.exports = { analyze, analyzeLegacy, computeFromItems };
