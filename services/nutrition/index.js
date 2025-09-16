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
      needsTemplateFallback(aiResult.items)) // ← “全部 g=0”もここに入る
  ) {
    // 1) まずアーキタイプ
    const archetypeResult = findArchetype(input.text);
    if (archetypeResult) {
      console.debug(
        '[nutrition] fallback=archetype',
        archetypeResult.archetype_id,
      );
      aiResult = {
        ...aiResult,
        ...archetypeResult,
        items: archetypeResult.items, // 既定量つきに置換
        meta: makeMeta({
          source_kind: 'recipe',
          fallback_level: 1,
          archetype_id: archetypeResult.archetype_id,
        }),
      };
    } else {
      // 2) 当たらなければキーワード既定（必ずここに落ちる）
      const text = input.text || '';
      let items = [];
      if (/カツ丼|とんかつ|トンカツ/i.test(text)) {
        items = [
          {
            code: 'pork_loin_cutlet',
            qty_g: 120,
            include: true,
            pending: true,
          },
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
      } else if (/(定食|teishoku)/i.test(text)) {
        items = [
          { code: 'rice_cooked', qty_g: 200, include: true, pending: true },
        ];
      }
      if (items.length) {
        console.debug('[nutrition] fallback=keyword');
        aiResult = {
          dish: text,
          confidence: 0,
          items,
          meta: makeMeta({ source_kind: 'keyword', fallback_level: 1 }),
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
  if (hasDirectRoot || hasDirectNested) {
    console.debug(
      '[nutrition] path=direct%s',
      hasDirectNested ? '(nested)' : '',
    );
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
    };
  }

  console.debug('[nutrition] path=items');
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
      // ★ 第2段フォールバックでも fallback 扱いだと明示する（丸めガードを発火させる）
      aiResult.meta = makeMeta({
        source_kind: 'recipe',
        fallback_level: 2,
        archetype_id: arch2.archetype_id,
      });
    }
  }
  const slots = buildSlots(normItems, aiResult.meta?.archetype_id);
  const resolvedItems = resolveNames(normItems);

  aiResult.base_confidence = aiResult.base_confidence ?? aiResult.confidence;
  // If any items are pending, the overall confidence must be 0.
  if (resolvedItems.some((i) => i.pending)) {
    aiResult.confidence = 0;
  }

  const { POLICY } = require('./policy.js');
  // ★ フォールバック + 全pending かつ policy が許可した時だけ 0 に丸める
  const allPending =
    resolvedItems.length > 0 && resolvedItems.every((i) => i.pending);
  const isFallback =
    (aiResult.meta?.fallback_level ??
      deriveMetaFromLegacy(aiResult).fallback_level) >= 1;

  if (
    POLICY.calorieMaskStrategy === 'fallback_all_pending' &&
    isFallback &&
    allPending
  ) {
    // 影響を最小化するため calories だけ 0 にします（P/F/C はそのまま）
    kcal = 0;
    // デバッグが欲しければ:
    // console.debug('[nutrition] kcal masked because fallback+allPending');
  }

  const finalMeta = aiResult.meta || deriveMetaFromLegacy(aiResult);
  console.debug('[fallback]', {
    used: finalMeta.source_kind || 'none',
    dish: aiResult.dish,
  });

  return {
    dish: aiResult.dish,
    confidence: aiResult.confidence,
    base_confidence: aiResult.base_confidence, // Add base_confidence here
    nutrition: { protein_g: P, fat_g: F, carbs_g: C, calories: kcal },
    atwater,
    range,
    breakdown: {
      items: resolvedItems,
      slots,
      warnings: warnings,
    },
    meta: finalMeta,
    // 互換: 旧クライアント向けに残す（将来削除のTODO付け推奨）
    landing_type: aiResult.landing_type,
    archetype_id: finalMeta.archetype_id ?? aiResult.archetype_id,
  };
}

async function analyzeLegacy(input) {
  return analyze(input);
}

module.exports = { analyze, analyzeLegacy, computeFromItems };
