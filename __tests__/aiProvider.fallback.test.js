const {
  createAiProvider,
} = require('../services/nutrition/providers/aiProvider');

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('aiProvider fallback behaviour', () => {
  const originalEnv = process.env.ENABLE_AI;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ENABLE_AI;
    else process.env.ENABLE_AI = originalEnv;
    jest.clearAllMocks();
  });

  test('falls back to dict when AI is disabled', async () => {
    process.env.ENABLE_AI = 'false';

    const dictResult = {
      dish: 'fallback',
      confidence: 0.42,
      nutrition: { calories: 210, protein_g: 18, fat_g: 6, carbs_g: 25 },
      breakdown: { items: [{ name: 'fallback-item' }], warnings: [] },
      meta: { source_kind: 'template', fallback_level: 1 },
    };

    const dictFallback = {
      analyzeLegacy: jest.fn().mockResolvedValue(dictResult),
    };

    const logger = {
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    };

    const provider = createAiProvider({ dictFallback, logger });
    const response = await provider.analyze({
      text: 'サバの味噌煮',
      locale: 'ja',
    });
    await flushPromises();

    expect(dictFallback.analyzeLegacy).toHaveBeenCalledTimes(1);
    expect(response.totals.kcal).toBe(210);
    expect(Array.isArray(response.warnings)).toBe(true);
    expect(response.warnings).toContain('ai_fallback_dict');
  });
});
