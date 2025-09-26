function stripCodeFences(text = '') {
  return String(text)
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
}

function safeJsonParse(text) {
  try {
    return JSON.parse(stripCodeFences(text));
  } catch (_err) {
    return null;
  }
}

function toProviderPayload(raw, { fallbackDish = null } = {}) {
  if (!raw) {
    return {
      dish: fallbackDish,
      totals: { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
      items: [],
      warnings: [],
      confidence: null,
      meta: {},
    };
  }
  const base = typeof raw === 'string' ? safeJsonParse(raw) : raw;
  if (!base || typeof base !== 'object') {
    return {
      dish: fallbackDish,
      totals: { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
      items: [],
      warnings: [],
      confidence: null,
      meta: {},
    };
  }
  return {
    dish: base.dish ?? fallbackDish ?? null,
    totals: base.totals ?? base.nutrition ?? {},
    items: base.items ?? [],
    warnings: Array.isArray(base.warnings) ? base.warnings : [],
    confidence: base.confidence ?? base.score ?? null,
    meta: base.meta ?? {},
  };
}

module.exports = {
  stripCodeFences,
  safeJsonParse,
  toProviderPayload,
};
