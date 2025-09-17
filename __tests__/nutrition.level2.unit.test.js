jest.mock('../services/nutrition/providers/geminiProvider', () => ({
  analyze: jest.fn(),
}));

describe('fallback (new spec)', () => {
  let analyze, geminiProvider;
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    geminiProvider = require('../services/nutrition/providers/geminiProvider');
    ({ analyze } = require('../services/nutrition'));
  });

  it('forces template fallback (level=1)', async () => {
    geminiProvider.analyze.mockResolvedValueOnce({
      dish: 'とんかつ定食',
      items: [],
      confidence: 0.7,
      meta: { source_kind: 'ai', fallback_level: 0 },
    });
    const result = await analyze({ text: 'とんかつ定食' });
    expect(result.meta.source_kind).toBe('template');
    expect(result.meta.fallback_level).toBe(1);
    expect(result.nutrition.calories).toBeGreaterThan(0); // 0マスクはしない
  });
});
