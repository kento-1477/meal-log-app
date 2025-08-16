// __tests__/nutrition.gemini.unit.test.js
const {
  analyzeText,
} = require('../src/services/nutrition/providers/geminiProvider');

describe('Gemini Nutrition Provider Unit Tests', () => {
  beforeEach(() => {
    process.env.GEMINI_MOCK = '1';
  });

  test('should return correct nutrition for ラーメンライス', async () => {
    const nutrition = await analyzeText({ text: 'ラーメンライス' });
    expect(nutrition.calories).toBe(850);
    expect(nutrition.items.length).toBe(2);
  });

  test('should return correct nutrition for カツ丼', async () => {
    const nutrition = await analyzeText({ text: 'カツ丼' });
    expect(nutrition.calories).toBe(850);
    expect(nutrition.items.length).toBe(3);
  });

  test('should handle unknown food with default mock', async () => {
    const nutrition = await analyzeText({ text: '不明な食べ物' });
    expect(nutrition.calories).toBe(500);
  });
});
