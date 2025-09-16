/**
 * Fallback kcal behaviour tests
 * - default policy: > 0 kcal
 * - with CALORIE_MASK_STRATEGY=fallback_all_pending: 0 kcal
 *
 * NOTE:
 *   プロバイダのモックは、あなたのプロジェクトの実際の相対パスに合わせてください。
 *   例では "../services/nutrition/providers/gemini" を仮定しています。
 */

describe('Analyze fallback when AI returns 0g-only items', () => {
  const providerPath = '../services/nutrition/providers/geminiProvider'; // ←必要なら調整
  const modulePath = '../services/nutrition/index.js'; // ←必要なら調整

  const mockAI = (payload) => {
    // 環境やexportsを再読込させるために毎回リセット
    jest.resetModules();
    jest.doMock(
      providerPath,
      () => ({
        analyze: jest.fn().mockResolvedValue(payload),
      }),
      { virtual: true },
    );
    return require(modulePath); // { analyze }
  };

  afterEach(() => {
    jest.resetModules();
    jest.dontMock(providerPath);
    delete process.env.CALORIE_MASK_STRATEGY;
  });

  test('default policy => calories > 0 (fallback recipe or keyword used)', async () => {
    const { analyze } = mockAI({
      dish: '豚カツ',
      // AIが「0gの材料だけ」を返すケースを再現
      items: [
        { name: '豚肉', qty_g: 0 },
        { name: '小麦粉', qty_g: 0 },
        { name: 'パン粉', qty_g: 0 },
      ],
      confidence: 0.7,
    });

    const res = await analyze({ text: 'とんかつ' });

    expect(res.meta.fallback_level).toBeGreaterThanOrEqual(1);
    expect(res.breakdown.items.length).toBeGreaterThan(0);
    // 本番デフォルト（CALORIE_MASK_STRATEGY=never）ではマスクされない
    expect(Number(res.nutrition.calories)).toBeGreaterThan(0);
  });

  test('CALORIE_MASK_STRATEGY=fallback_all_pending => calories masked to 0', async () => {
    process.env.CALORIE_MASK_STRATEGY = 'fallback_all_pending';

    const { analyze } = mockAI({
      dish: '豚カツ',
      items: [
        { name: '豚肉', qty_g: 0 },
        { name: '小麦粉', qty_g: 0 },
      ],
      confidence: 0.7,
    });

    const res = await analyze({ text: 'とんかつ' });

    expect(res.meta.fallback_level).toBeGreaterThanOrEqual(1);
    expect(res.breakdown.items.length).toBeGreaterThan(0);
    // すべて pending の既定パスでは kcal を 0 に丸める（テスト時だけ）
    expect(Number(res.nutrition.calories)).toBe(0);
  });
});
