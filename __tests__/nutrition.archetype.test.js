const { analyze } = require('../services/nutrition');

describe('Nutrition Analysis with Archetype Fallback', () => {
  beforeAll(() => {
    // Ensure all tests run in mock mode to isolate from live AI
    process.env.GEMINI_MOCK = '1';
  });

  it('should return an empty result for non-archetype, non-keyword input', async () => {
    const input = { text: '寿司' };
    const result = await analyze(input);

    expect(result.breakdown.items).toEqual([]);
    expect(result.nutrition.calories).toBe(0);
    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  describe('Archetype Matching', () => {
    it('should match "牛丼" to the gyudon archetype', async () => {
      const input = { text: '牛丼大盛り' };
      const result = await analyze(input);

      expect(result.archetype_id).toBe('gyudon');
      expect(result.dish).toBe('牛丼');
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.breakdown.items.length).toBe(2);
      expect(result.breakdown.items.every((item) => item.pending)).toBe(true);
      expect(result.nutrition.calories).toBe(0); // Because all items are pending

      const rice = result.breakdown.items.find((i) => i.code === 'rice_cooked');
      expect(rice.qty_g).toBe(250); // regular size from archetype
    });

    it('should match "焼き魚定食" to the yakizakana_teishoku archetype', async () => {
      const input = { text: '焼き魚定食' };
      const result = await analyze(input);

      expect(result.archetype_id).toBe('yakizakana_teishoku');
      expect(result.dish).toBe('焼き魚定食');
      expect(result.breakdown.items.length).toBe(4);
      expect(result.breakdown.items.every((item) => item.pending)).toBe(true);
      expect(result.nutrition.calories).toBe(0);
    });
  });

  describe('Final Deterministic Fallback', () => {
    it('should fall back to keyword match for "とんかつ" when AI and archetype fail', async () => {
      // This test assumes the AI mock returns empty, and "とんかつ" is not an archetype keyword
      const input = { text: 'とんかつ' };
      const result = await analyze(input);

      expect(result.archetype_id).toBeUndefined();
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.breakdown.items.length).toBe(2);
      expect(result.breakdown.items.every((item) => item.pending)).toBe(true);
      expect(result.nutrition.calories).toBe(0);
      expect(result.breakdown.items.map((i) => i.code)).toContain(
        'pork_loin_cutlet',
      );
    });

    it('should fall back to teishoku rice for "さば定食"', async () => {
      const input = { text: 'さば定食' };
      const result = await analyze(input);

      expect(result.archetype_id).toBeUndefined();
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.breakdown.items.length).toBe(1);
      expect(result.breakdown.items[0].code).toBe('rice_cooked');
      expect(result.breakdown.items[0].pending).toBe(true);
      expect(result.nutrition.calories).toBe(0);
    });
  });
});
