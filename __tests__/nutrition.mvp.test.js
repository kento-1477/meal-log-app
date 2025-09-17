// __tests__/nutrition.mvp.test.js
jest.mock('../services/nutrition/providers/geminiProvider', () => ({
  analyze: jest.fn(),
}));

describe('Nutrition MVP Logic (Simplified)', () => {
  let geminiProvider;
  let analyze, canonDish, canonIngredient, finalizeTotals;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // ① 先にモックの“現在世代”を取得
    geminiProvider = require('../services/nutrition/providers/geminiProvider');

    // ② 依存する実装を“通常の require”でこの世代に束ねて読み込む
    const nutritionModule = require('../services/nutrition');
    const nameResolverModule = require('../services/nutrition/nameResolver');
    const policyModule = require('../services/nutrition/policy');

    analyze = nutritionModule.analyze;
    ({ canonDish, canonIngredient } = nameResolverModule);
    ({ finalizeTotals } = policyModule);
  });

  // 1. Atwater Consistency（「改善していること」を検証）
  describe('1. Atwater Consistency', () => {
    it('should adjust fat and reduce delta', () => {
      const sum = { P: 50, F: 20, C: 100, kcal: 1000 }; // 初期 kpf=780
      const initialDelta = Math.abs(4 * 50 + 9 * 20 + 4 * 100 - 1000) / 1000; // 0.22
      const { atwater } = finalizeTotals(sum);
      expect(atwater.delta).toBeLessThan(initialDelta);
    });

    it('should scale if fat adjust is not enough (still improves)', () => {
      const sum = { P: 10, F: 10, C: 10, kcal: 1000 }; // 初期 kpf=170
      const initialDelta = Math.abs(4 * 10 + 9 * 10 + 4 * 10 - 1000) / 1000; // 0.83
      const { atwater } = finalizeTotals(sum);
      expect(atwater.delta).toBeLessThan(initialDelta);
    });
  });

  // 2. Template Fallback（語彙は template / level は 1）
  describe('2. Template Fallback', () => {
    it('should apply template when AI returns no usable items', async () => {
      geminiProvider.analyze.mockResolvedValueOnce({
        dish: 'とんかつ定食',
        confidence: 0.75,
        items: [{ name: 'pork', qty_g: 0 }], // フォールバック誘発
        meta: { source_kind: 'ai', fallback_level: 0 },
      });

      const result = await analyze({ text: 'とんかつ定食' });

      expect(result.meta.fallback_level).toBe(1);
      expect(result.meta.source_kind).toBe('template');
      expect(result.meta.archetype_id).toBe('tonkatsu_teishoku');
      expect(result.nutrition.calories).toBeGreaterThan(0);
      expect(
        result.breakdown.items.some((i) => i.code === 'pork_loin_cutlet'),
      ).toBe(true);
    });
  });

  // 3. Confidence Preservation（AI由来の confidence を保持）
  describe('3. Confidence Preservation', () => {
    it('should preserve AI confidence even if items are pending', async () => {
      geminiProvider.analyze.mockResolvedValueOnce({
        dish: 'とんかつ定食',
        confidence: 0.88, // ← これを保持できること
        items: [], // テンプレに落ちる
        meta: { source_kind: 'ai', fallback_level: 0 },
      });

      const result = await analyze({ text: 'とんかつ定食' });

      expect(result.meta.fallback_level).toBe(1);
      expect(result.meta.source_kind).toBe('template');
      expect(result.confidence).toBe(0.88); // ★ 本命
      expect(result.breakdown.items.length).toBeGreaterThan(0);
    });
  });

  // 4. Name Resolution Prevention
  describe('4. Name Resolution Prevention', () => {
    it('should not resolve "カツオ" or "ロースト" to "とんかつ"', () => {
      expect(canonIngredient('カツオ')).toBe('カツオ');
      expect(canonIngredient('ローストビーフ')).toBe('ローストビーフ');

      expect(canonDish('カツオのたたき')).not.toBe('とんかつ');
      expect(canonDish('ローストチキン')).not.toBe('とんかつ');
    });
  });
});
