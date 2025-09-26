const {
  normalizeAnalysisForResponse,
} = require('../services/nutrition/normalizeResponse');

describe('normalizeAnalysisForResponse', () => {
  test('fills nutrition from totals when provided', () => {
    const input = {
      totals: { kcal: 180, protein_g: 12, fat_g: 6, carbs_g: 20 },
    };
    const result = normalizeAnalysisForResponse(input);
    expect(result.totals).toEqual({
      kcal: 180,
      protein_g: 12,
      fat_g: 6,
      carbs_g: 20,
    });
    expect(result.nutrition).toEqual({
      calories: 180,
      protein_g: 12,
      fat_g: 6,
      carbs_g: 20,
    });
  });

  test('derives totals when only nutrition is present', () => {
    const input = {
      nutrition: { calories: 250, protein_g: 15, fat_g: 8, carbs_g: 30 },
    };
    const result = normalizeAnalysisForResponse(input);
    expect(result.totals).toEqual({
      kcal: 250,
      protein_g: 15,
      fat_g: 8,
      carbs_g: 30,
    });
    expect(result.nutrition).toEqual({
      calories: 250,
      protein_g: 15,
      fat_g: 8,
      carbs_g: 30,
    });
  });

  test('normalizes items and warnings from breakdown or top-level', () => {
    const input = {
      items: [{ name: 'rice' }],
      warnings: ['legacy-warning'],
      breakdown: { warnings: ['breakdown-warning'] },
    };
    const result = normalizeAnalysisForResponse(input);
    expect(result.items).toEqual([{ name: 'rice' }]);
    expect(result.breakdown.warnings).toEqual(['breakdown-warning']);
  });
});
