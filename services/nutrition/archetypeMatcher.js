const archetypes = require('../../src/data/archetypes.json');

/**
 * Finds the best matching archetype for a given text input.
 * @param {string} text The user's input text (e.g., "大盛り牛丼").
 * @returns {object|null} The matched archetype result or null if no match.
 */
function findArchetype(text) {
  if (!text) return null;

  const normalizedText = text.toLowerCase();
  let bestMatch = null;
  let highestScore = -1;

  for (const archetype of archetypes.archetypes) {
    for (const keyword of archetype.keywords) {
      if (normalizedText.includes(keyword.toLowerCase())) {
        // Simple scoring: longer keyword match is better.
        const score = keyword.length;
        if (score > highestScore) {
          highestScore = score;
          bestMatch = archetype;
        }
      }
    }
  }

  if (bestMatch) {
    const defaultPortionKey = bestMatch.defaults.portion || 'regular';
    const defaultPortion = bestMatch.portions[defaultPortionKey];

    if (!defaultPortion) return null; // Malformed archetype

    const items = Object.entries(defaultPortion).map(([code, qty_g]) => ({
      code,
      name: code, // Placeholder, should be resolved later
      qty_g,
      pending: true, // All items from an archetype are initially pending
    }));

    return {
      landing_type: 'archetype',
      confidence: 0.3, // Per user spec, archetype matches have low confidence
      archetype_id: bestMatch.id,
      dish: bestMatch.name,
      items,
    };
  }

  return null;
}

module.exports = { findArchetype };
