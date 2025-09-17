jest.mock('../services/nutrition/providers/geminiProvider', () => ({
  analyze: jest.fn(),
}));

describe('Kcal Fallback (new spec)', () => {
  let analyze, geminiProvider;
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    geminiProvider = require('../services/nutrition/providers/geminiProvider');
    ({ analyze } = require('../services/nutrition'));
  });

  it('no kcal masking on template fallback', async () => {
    geminiProvider.analyze.mockResolvedValueOnce({
      dish: 'とんかつ定食',
      items: [],
      confidence: 0.88,
      meta: { source_kind: 'ai', fallback_level: 0 },
    });
    const res = await analyze({ text: 'とんかつ定食' });
    expect(res.meta.fallback_level).toBe(1);
    expect(res.meta.source_kind).toBe('template');
    expect(res.nutrition.calories).toBeGreaterThan(0);
  });
});
