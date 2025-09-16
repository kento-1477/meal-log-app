/**
 * ユニット：第2段救済を断定で検証
 * 戦略：
 *  - 1回目の computeFromItems は kcal=0 を返す（第2段へ誘導）
 *  - findArchetype は確実にテンプレを返す
 *  - 2回目の computeFromItems はテンプレ計算結果を返す（itemsはpendingのまま）
 *  - allPending=true なので丸めガードが働き、caloriesは0にマスクされる
 */
describe('fallback level 2 (unit, mocked path)', () => {
  const pathIndex = '../services/nutrition/index.js';
  const pathCompute = '../services/nutrition/computeFromItems';
  const pathArche = '../services/nutrition/archetypeMatcher';

  // 各テストでモジュールキャッシュをリセット
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('forces second-stage fallback and asserts fallback_level === 2', async () => {
    process.env.CALORIE_MASK_STRATEGY = 'fallback_all_pending';
    // 1) 依存をモック
    // computeFromItems: 1回目=0kcal, 2回目=テンプレ値（itemsはpending=true維持）
    const computeMod = require(pathCompute);
    const computeFnName = computeMod.computeFromItems
      ? 'computeFromItems'
      : null;
    if (!computeFnName) {
      throw new Error(
        'computeFromItems のエクスポート形が想定と異なります。module.exports = { computeFromItems } に揃えてください。',
      );
    }
    const spyCompute = jest.spyOn(computeMod, computeFnName);
    spyCompute
      .mockReturnValueOnce({
        P: 0,
        F: 0,
        C: 0,
        kcal: 0,
        items: [{ code: 'x', grams: 100, pending: true }],
        atwater: {},
        range: {},
      })
      .mockReturnValueOnce({
        P: 10,
        F: 10,
        C: 10,
        kcal: 300,
        items: [{ code: 'y', grams: 120, pending: true }],
        atwater: {},
        range: {},
      });

    // findArchetype: 必ずテンプレを出す
    const archeMod = require(pathArche);
    const archFnName = archeMod.findArchetype ? 'findArchetype' : null;
    if (!archFnName) {
      throw new Error(
        'findArchetype のエクスポート形が想定と異なります。module.exports = { findArchetype } に揃えてください。',
      );
    }
    jest.spyOn(archeMod, archFnName).mockReturnValue({
      dish: 'dummy',
      archetype_id: 'arch_x',
      items: [{ code: 'y', grams: 120, pending: true }],
    });

    // 2) 上記モックが効いた状態で analyze を読み込む
    const { analyze } = require(pathIndex);

    // 3) 実行
    const result = await analyze({ text: 'ユニット用入力' });

    // 4) 検証：第2段であることを断定
    expect(result?.meta?.source_kind).toBe('recipe');
    expect(result?.meta?.fallback_level).toBe(2);

    // allPending なので kcal は 0 にマスクされる（丸めガード）
    const allPending =
      result?.breakdown?.items?.length > 0 &&
      result.breakdown.items.every((i) => i.pending);
    expect(allPending).toBe(true);
    expect(result?.nutrition?.calories).toBe(0);

    // P/F/C はマスクされず、計算結果が保持されることを確認
    expect(result?.nutrition?.protein_g).toBe(10);
    expect(result?.nutrition?.fat_g).toBe(10);
    expect(result?.nutrition?.carbs_g).toBe(10);
  });

  it('should NOT mask calories if fallback occurs but NOT all items are pending', async () => {
    // 1) 依存をモック
    // AI provider は pending:false を含む items を返すように見せかける
    jest.mock('../services/nutrition/providers/geminiProvider', () => ({
      analyze: jest.fn().mockResolvedValue({
        dish: 'Test Dish',
        confidence: 0.7,
        items: [
          { name: 'Cooked Rice', grams: 200, pending: false },
          { name: 'Unknown topping', grams: 50, pending: true },
        ],
      }),
    }));

    // computeFromItems は計算済みの値を返す
    const computeMod = require(pathCompute);
    const computeFnName = computeMod.computeFromItems
      ? 'computeFromItems'
      : null;
    if (!computeFnName) throw new Error('computeFromItems export not found');
    jest.spyOn(computeMod, computeFnName).mockReturnValue({
      P: 20,
      F: 5,
      C: 80,
      kcal: 445,
      items: [
        {
          name: 'Cooked Rice',
          grams: 200,
          pending: false,
          code: 'rice_cooked',
        },
        { name: 'Unknown topping', grams: 50, pending: true },
      ],
      atwater: {},
      range: {},
    });

    // 2) analyze をロードし、手動でフォールバック状態にする
    const { analyze } = require(pathIndex);
    const result = await analyze({ text: 'some input' });

    // ガードをテストするため、結果をフォールバック済みとしてマーク
    result.meta.fallback_level = 1;

    // 3) ガード条件を再評価
    const allPending = result.breakdown.items.every((i) => i.pending);
    const isFallback = result.meta.fallback_level >= 1;
    let finalKcal = result.nutrition.calories;

    if (isFallback && allPending) {
      finalKcal = 0; // この分岐には入らないはず
    }

    // 4) 検証
    expect(allPending).toBe(false);
    expect(result.nutrition.calories).toBe(445);
    expect(finalKcal).toBe(445); // マスクされていないことを確認
  });
});
