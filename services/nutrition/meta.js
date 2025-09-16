// services/nutrition/meta.js

function makeMeta({ source_kind, fallback_level = 0, archetype_id } = {}) {
  return {
    source_kind, // 'ai' | 'recipe' | 'keyword'
    fallback_level, // 0 | 1 | 2
    ...(archetype_id ? { archetype_id } : {}),
  };
}

// 旧データからの互換読み
function deriveMetaFromLegacy(aiResult = {}) {
  const lt = aiResult?.landing_type;
  const byLanding =
    lt === 'template_fallback'
      ? { source_kind: 'recipe', fallback_level: 1 }
      : lt === 'fallback_keyword'
        ? { source_kind: 'keyword', fallback_level: 1 }
        : null;

  const withArch = aiResult?.archetype_id
    ? { archetype_id: aiResult.archetype_id }
    : {};
  if (byLanding) return { ...byLanding, ...withArch };
  // 互換：landing_type が無くても archetype_id があれば「レシピ救済(1)」相当とみなす
  if (!byLanding && aiResult?.archetype_id) {
    return {
      source_kind: 'recipe',
      fallback_level: 1,
      archetype_id: aiResult.archetype_id,
    };
  }
  // デフォルト：AI直値扱い
  return { source_kind: 'ai', fallback_level: 0, ...withArch };
}

module.exports = { makeMeta, deriveMetaFromLegacy };
