const geminiProvider = require('./geminiProvider');
const { computeFromItems } = require('../computeFromItems');
const { buildSlots } = require('../slots');
const { findArchetype } = require('../archetypeMatcher');
const { resolveNames } = require('../nameResolver');
const { finalizeTotals } = require('../policy.js');
const { makeMeta, deriveMetaFromLegacy } = require('../meta');

const IS_TEST = process.env.NODE_ENV === 'test' || process.env.CI === '1';
const LOG_VERBOSE = process.env.LOG_VERBOSE === '1';

function pickConfidence(...candidates) {
  for (const candidate of candidates) {
    if (
      typeof candidate === 'number' &&
      Number.isFinite(candidate) &&
      candidate > 0
    ) {
      return candidate;
    }
  }
  return 0.6;
}

function safeLog(prefix, payload) {
  // Jest/CIは既定で抑止（必要なときだけ LOG_VERBOSE=1 で出す）
  if (IS_TEST && !LOG_VERBOSE) return;
  try {
    if (payload === undefined) {
      console.log(String(prefix));
    } else if (typeof payload === 'string') {
      console.log(`${prefix}${payload}`);
    } else {
      // 循環参照でも落ちないようにJSON化を最小限に
      console.log(
        `${prefix}${JSON.stringify(payload, (_k, v) => {
          // BigInt など toString に逃がす
          if (typeof v === 'bigint') return v.toString();
          return v;
        })}`,
      );
    }
  } catch (_e) {
    console.log(`${prefix}[unserializable]`);
  }
}

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
      safeLog('Attempting analysis with Gemini...');
      return await geminiProvider.analyze(input); // GEMINI_MOCK=1 ならモックが返る
    } catch (_error) {
      safeLog('Gemini analysis failed, falling back to deterministic.', _error);
      throw _error;
    }
  }
  safeLog('AI analysis is not enabled or provider is not Gemini.');
  throw new Error('AI not configured');
}

async function analyzeInternal(input, { useGemini }) {
  let aiResult;
  if (useGemini) {
    try {
      aiResult = await realAnalyze(input);
      aiResult.meta = makeMeta({ source_kind: 'ai', fallback_level: 0 });
    } catch (_error) {
      aiResult = {
        dish: input.text || '食事',
        items: [],
        meta: makeMeta({ source_kind: 'ai', fallback_level: 0, error: true }),
      };
    }
  } else {
    if (process.env.NODE_ENV !== 'test') {
      try {
        console.debug('[dictProvider] skip gemini', { text: input?.text });
      } catch (_e) {
        /* noop */
      }
    }
    aiResult = {
      dish: input.text || '食事',
      items: [],
      meta: makeMeta({ source_kind: 'ai', fallback_level: 0, skipped: true }),
    };
  }

  // Preserve original AI confidence
  const originalAiConfidence = aiResult.confidence;

  if (
    aiResult &&
    (!Array.isArray(aiResult.items) ||
      aiResult.items.length === 0 ||
      needsTemplateFallback(aiResult.items))
  ) {
    const archetypeResult = findArchetype(input.text);
    if (archetypeResult) {
      aiResult = {
        ...archetypeResult, // Base from archetype
        items: archetypeResult.items, // Ensure archetype's items are used
        ...aiResult, // Overlay original AI result (meta はここで上書きされる)
        meta: makeMeta({
          // 最後に meta を設定
          source_kind: 'template',
          fallback_level: 1,
          archetype_id: archetypeResult.archetype_id,
        }),
      };
      aiResult.confidence ??= pickConfidence(
        originalAiConfidence,
        aiResult.confidence,
        aiResult.base_confidence,
      );
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
          items,
          meta: makeMeta({ source_kind: 'template', fallback_level: 1 }),
        };
        aiResult.confidence ??= pickConfidence(
          originalAiConfidence,
          aiResult.confidence,
          aiResult.base_confidence,
          0.6,
        );
      } else {
        aiResult = {
          ...aiResult,
          items: [],
          meta: makeMeta({ source_kind: 'ai', fallback_level: 0 }),
        };
        aiResult.confidence ??= pickConfidence(
          originalAiConfidence,
          aiResult.confidence,
          aiResult.base_confidence,
        );
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
    safeLog('[nutrition]', {
      path,
      fallback_used: (finalMeta.fallback_level ?? 0) > 0,
      atwater_delta,
    });

    const compatMeta = {
      ...finalMeta,
      source_kind: finalMeta?.source_kind ?? 'ai',
      fallback_level: finalMeta?.fallback_level ?? 0,
    };
    const result = {
      dish: aiResult.dish,
      confidence: pickConfidence(
        originalAiConfidence,
        aiResult.confidence,
        aiResult.base_confidence,
      ),
      base_confidence: aiResult.base_confidence,
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
      meta: compatMeta,
    };
    result.items = result.breakdown.items || [];

    return result;
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

  const finalMeta = aiResult.meta || deriveMetaFromLegacy(aiResult);
  safeLog('[nutrition]', {
    path,
    fallback_used: (finalMeta.fallback_level ?? 0) > 0,
    atwater_delta: atwater?.delta,
  });

  const compatMeta = {
    ...finalMeta,
    source_kind: finalMeta?.source_kind ?? 'template',
    fallback_level: finalMeta?.fallback_level ?? 1,
  };
  const result = {
    dish: aiResult.dish,
    confidence: pickConfidence(
      originalAiConfidence,
      aiResult.confidence,
      aiResult.base_confidence,
    ),
    base_confidence: aiResult.base_confidence,
    nutrition: { protein_g: P, fat_g: F, carbs_g: C, calories: kcal },
    atwater,
    range,
    breakdown: {
      items: resolvedItems,
      slots,
      warnings: warnings,
    },
    meta: compatMeta,
  };
  result.items = result.breakdown.items || [];

  return result;
}

function createDictProvider(options = {}) {
  const providerOptions = { useGemini: options?.useGemini !== false };
  return {
    analyze: (input) => analyzeInternal(input, providerOptions),
    analyzeLegacy: (input) => analyzeInternal(input, providerOptions),
  };
}

module.exports = { createDictProvider };
