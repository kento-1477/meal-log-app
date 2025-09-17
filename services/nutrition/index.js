const geminiProvider = require('./providers/geminiProvider');
const { computeFromItems } = require('./computeFromItems');
const { buildSlots } = require('./slots');
const { findArchetype } = require('./archetypeMatcher');
const { resolveNames } = require('./nameResolver');
const { finalizeTotals } = require('./policy.js');
const { makeMeta, deriveMetaFromLegacy } = require('./meta');

/**
 * Checks if at least one item in the array has a usable gram value.
 * Mirrors the logic of getGrams() in computeFromItems.js for consistency.
 */
function hasUsableGrams(items = []) {
  if (!Array.isArray(items)) return false;
  return items.some((it) => {
    const raw =
      it?.grams ?? it?.qty_g ?? it?.quantity_g ?? it?.g ?? it?.amount ?? 0;
    const n = Number(String(raw).replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0;
  });
}

/** gramsが1つも確定していない配列なら true */
function needsTemplateFallback(items) {
  if (!Array.isArray(items) || items.length === 0) return false;
  return !hasUsableGrams(items);
}

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
    aiResult.meta = makeMeta({ source_kind: 'ai', fallback_level: 0 });
  } catch (_error) {
    // If AI provider itself fails, set a default empty structure
    aiResult = {
      dish: input.text || '食事',
      confidence: 0,
      items: [],
      meta: makeMeta({ source_kind: 'ai', fallback_level: 0, error: true }),
    };
  }

  if (aiResult?.labelNutrition?.perServing) {
    const t = aiResult.labelNutrition.perServing;
    const { total, atwater } = finalizeTotals({
      P: t.P,
      F: t.F,
      C: t.C,
      kcal: t.kcal,
    });
    return {
      dish: aiResult.dish,
      confidence: 1.0,
      source: 'label',
      nutrition: {
        protein_g: total.P,
        fat_g: total.F,
        carbs_g: total.C,
        calories: total.kcal,
      },
      atwater,
      breakdown: {
        items: [
          {
            name: '栄養成分表示(1食)',
            grams: null,
            source: 'label',
            pending: false,
            P: total.P,
            F: total.F,
            C: total.C,
            kcal: total.kcal,
          },
        ],
        slots: [],
        warnings: [],
      },
    };
  }

  if (
    aiResult &&
    (!Array.isArray(aiResult.items) ||
      aiResult.items.length === 0 ||
      needsTemplateFallback(aiResult.items))
  ) {
    const archetypeResult = findArchetype(input.text);
    if (archetypeResult) {
      const originalConfidence = aiResult.confidence; // Store original confidence
      aiResult = {
        ...archetypeResult, // Base from archetype
        items: archetypeResult.items, // Ensure archetype's items are used
        confidence: originalConfidence, // Explicitly set original confidence
        ...aiResult, // Overlay original AI result (meta はここで上書きされる)
        meta: makeMeta({
          // 最後に meta を設定
          source_kind: 'template',
          fallback_level: 1,
          archetype_id: archetypeResult.archetype_id,
        }),
      };
    } else {
      const text = input.text || '';
      let items = [];
      if (/(定食|teishoku)/i.test(text)) {
        items = [
          { code: 'rice_cooked', qty_g: 200, include: true, pending: true },
        ];
      }
      if (items.length) {
        aiResult = {
          dish: text,
          confidence: aiResult.confidence ?? 0.6,
          items,
          meta: makeMeta({ source_kind: 'template', fallback_level: 1 }),
        };
      } else {
        aiResult = {
          ...aiResult,
          items: [],
          meta: makeMeta({ source_kind: 'ai', fallback_level: 0 }),
        };
      }
    }
  }

  const hasDirectRoot =
    aiResult &&
    ['calories', 'protein_g', 'fat_g', 'carbs_g'].some(
      (k) => Number(aiResult?.[k]) > 0,
    );
  const hasDirectNested =
    aiResult?.nutrition &&
    ['calories', 'protein_g', 'fat_g', 'carbs_g'].some(
      (k) => Number(aiResult?.nutrition?.[k]) > 0,
    );
  const path = hasDirectRoot || hasDirectNested ? 'ai/direct' : 'item/template';

  if (path === 'ai/direct') {
    const p = Number(
      aiResult?.protein_g ?? aiResult?.nutrition?.protein_g ?? 0,
    );
    const f = Number(aiResult?.fat_g ?? aiResult?.nutrition?.fat_g ?? 0);
    const c = Number(aiResult?.carbs_g ?? aiResult?.nutrition?.carbs_g ?? 0);
    const kcal = Number(
      aiResult?.calories ?? aiResult?.nutrition?.calories ?? 0,
    );
    const slots = buildSlots(aiResult.items ?? [], aiResult.meta?.archetype_id);
    const { total, atwater, range } = finalizeTotals({
      P: p,
      F: f,
      C: c,
      kcal,
    });

    const finalMeta = aiResult.meta || deriveMetaFromLegacy(aiResult);
    const atwater_delta =
      atwater && Number.isFinite(atwater.delta) ? atwater.delta : 0;
    console.log('[nutrition]', {
      path,
      fallback_used: (finalMeta.fallback_level ?? 0) > 0,
      atwater_delta,
    });

    return {
      dish: aiResult.dish,
      confidence: aiResult.confidence ?? 0.6,
      nutrition: {
        protein_g: total.P,
        fat_g: total.F,
        carbs_g: total.C,
        calories: total.kcal,
      },
      atwater,
      range,
      breakdown: {
        items: aiResult.items ?? [],
        slots,
        warnings: aiResult.warnings ?? [],
      },
      meta: finalMeta,
    };
  }

  // Path: item/template
  let {
    P,
    F,
    C,
    kcal,
    warnings,
    items: normItems,
    atwater,
    range,
  } = computeFromItems(aiResult.items || [], aiResult.dish);

  if (!kcal || kcal === 0) {
    const arch2 = findArchetype(aiResult.dish || input.text);
    if (arch2?.items?.length) {
      ({
        P,
        F,
        C,
        kcal,
        atwater,
        range,
        warnings,
        items: normItems,
      } = computeFromItems(arch2.items, arch2.dish || aiResult.dish));
      (warnings ||= []).push(
        'AIの分量が不明だったため既定レシピで推定しました',
      );
      aiResult.meta = makeMeta({
        source_kind: 'template',
        fallback_level: 1,
        archetype_id: arch2.archetype_id,
      });
    }
  }

  const slots = buildSlots(normItems, aiResult.meta?.archetype_id);
  const resolvedItems = resolveNames(normItems);
  aiResult.base_confidence = aiResult.base_confidence ?? aiResult.confidence;
  // 最終防御：0 や undefined を返さない
  const isNum = (v) => Number.isFinite(v);
  const finalConfidence = isNum(aiResult.confidence)
    ? aiResult.confidence
    : isNum(aiResult.base_confidence)
      ? aiResult.base_confidence
      : 0.6;

  const finalMeta = aiResult.meta || deriveMetaFromLegacy(aiResult);
  console.log('[nutrition]', {
    path,
    fallback_used: (finalMeta.fallback_level ?? 0) > 0,
    atwater_delta: atwater?.delta,
  });

  return {
    dish: aiResult.dish,
    confidence: finalConfidence,
    base_confidence: aiResult.base_confidence,
    nutrition: { protein_g: P, fat_g: F, carbs_g: C, calories: kcal },
    atwater,
    range,
    breakdown: {
      items: resolvedItems,
      slots,
      warnings: warnings,
    },
    meta: finalMeta,
  };
}

async function analyzeLegacy(input) {
  return analyze(input);
}

module.exports = { analyze, analyzeLegacy, computeFromItems };
