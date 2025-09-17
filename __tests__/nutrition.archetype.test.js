jest.mock('../services/nutrition/providers/geminiProvider', () => ({
  analyze: jest.fn(),
}));

describe('Archetype Matching (new spec)', () => {
  let analyze, geminiProvider;
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    geminiProvider = require('../services/nutrition/providers/geminiProvider');
    ({ analyze } = require('../services/nutrition'));
  });

  it('matches 牛丼 → gyudon (template fallback)', async () => {
    geminiProvider.analyze.mockResolvedValueOnce({
      dish: '牛丼',
      items: [],
      confidence: 0.7,
      meta: { source_kind: 'ai', fallback_level: 0 },
    });
    const res = await analyze({ text: '牛丼' });
    expect(res.meta.source_kind).toBe('template');
    expect(res.meta.archetype_id).toBe('gyudon');
    expect(res.breakdown.items.length).toBeGreaterThan(0);
    expect(typeof res.confidence).toBe('number');
  });

  it('matches 焼き魚定食 → yakizakana_teishoku (template fallback)', async () => {
    geminiProvider.analyze.mockResolvedValueOnce({
      dish: '焼き魚定食',
      items: [],
      confidence: 0.7,
      meta: { source_kind: 'ai', fallback_level: 0 },
    });
    const res = await analyze({ text: '焼き魚定食' });
    expect(res.meta.source_kind).toBe('template');
    expect(res.meta.archetype_id).toBe('yakizakana_teishoku');
    expect(res.breakdown.items.length).toBeGreaterThan(0);
    expect(typeof res.confidence).toBe('number');
  });

  it('matches とんかつ定食 → tonkatsu_teishoku (template fallback)', async () => {
    geminiProvider.analyze.mockResolvedValueOnce({
      dish: 'とんかつ定食',
      items: [],
      confidence: 0.7,
      meta: { source_kind: 'ai', fallback_level: 0 },
    });
    const res = await analyze({ text: 'とんかつ定食' });
    expect(res.meta.source_kind).toBe('template');
    expect(res.meta.archetype_id).toBe('tonkatsu_teishoku');
    expect(res.breakdown.items.length).toBeGreaterThan(0);
    expect(typeof res.confidence).toBe('number');
  });
});
