const { createAiProvider } = require('./aiProvider');
const { createDictProvider } = require('./dictProvider');

function createHybridProvider({ catalog } = {}) {
  const aiProvider = createAiProvider();
  const dictProvider = createDictProvider();

  async function analyze({ text, locale = 'ja', userId = null }) {
    if (catalog && typeof catalog.search === 'function') {
      try {
        const candidates = await catalog.search(text, {
          locale,
          limit: Number(process.env.CANDIDATE_LIMIT || 3),
        });
        if (Array.isArray(candidates) && candidates.length) {
          const top = candidates[0];
          const totals = top?.totals || {
            kcal: top?.kcal_serv ?? top?.kcal_100g ?? 0,
            protein_g: top?.p_serv ?? top?.p_100g ?? 0,
            fat_g: top?.f_serv ?? top?.f_100g ?? 0,
            carbs_g: top?.c_serv ?? top?.c_100g ?? 0,
          };
          return {
            dish: top?.name ?? text ?? null,
            totals,
            items: [],
            warnings: (top?.confidence || 0) < 0.8 ? ['db_low_confidence'] : [],
            confidence: top?.confidence ?? null,
            meta: {
              provider: 'hybrid',
              source: 'off',
              code: top?.code ?? null,
              catalogHit: true,
            },
          };
        }
      } catch (error) {
        console.error('hybridProvider.catalogError', { error: error?.message });
      }
    }

    const aiResult = await aiProvider.analyze({ text, locale, userId });
    aiResult.meta = {
      ...(aiResult.meta || {}),
      provider: 'hybrid',
      fallback: 'ai',
    };
    return aiResult;
  }

  return {
    analyze,
    analyzeLegacy: dictProvider.analyzeLegacy,
  };
}

module.exports = { createHybridProvider };
