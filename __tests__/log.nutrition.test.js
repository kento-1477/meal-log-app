const request = require('supertest');
const app = require('../server');
const { pool } = require('../services/db.js');
const { createTestUser } = require('../tests/utils/createTestUser.js');
const geminiProvider = require('../services/nutrition/providers/geminiProvider');

describe('/log with nutrition', () => {
  let userId;
  let analyzeSpy;

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE users, meal_logs RESTART IDENTITY CASCADE',
    );
    userId = await createTestUser();
    // Spy on the real module's method
    analyzeSpy = jest.spyOn(geminiProvider, 'analyze');
  });

  afterEach(() => {
    // Restore original implementation and reset modules to ensure clean state
    analyzeSpy.mockRestore();
    jest.resetModules();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should insert meal, analyze nutrition, update row and respond with nutrition', async () => {
    // Provide a mock implementation for this specific test
    analyzeSpy.mockResolvedValue({
      dish: 'スパイされた料理',
      confidence: 0.8,
      meta: { source_kind: 'ai', fallback_level: 0 },
      items: [
        { code: 'rice_cooked', qty_g: 250, include: true },
        { code: 'chicken_breast_cooked', qty_g: 150, include: true },
      ],
    });

    const res = await request(app)
      .post('/log')
      .field('user_id', userId)
      .attach('image', Buffer.from('fake'), 'fake.jpg');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.logId).toBeDefined();

    expect(res.body.nutrition.calories).toBeGreaterThan(0);
    expect(res.body.nutrition.protein_g).toBeDefined();

    // Check that our spy was called correctly
    expect(analyzeSpy).toHaveBeenCalledWith({
      text: '',
      imageBuffer: expect.any(Buffer),
      mime: 'image/jpeg',
    });

    const { rows } = await pool.query(
      'SELECT calories, protein_g, fat_g, carbs_g FROM meal_logs WHERE id = $1',
      [res.body.logId],
    );
    const r = rows[0];
    expect(Number(r.calories)).toBeGreaterThan(0);
    expect(Number(r.protein_g)).toBeGreaterThan(0);
  });

  it('should map english codes to JP reps and sum kcal correctly', async () => {
    // Mock the return value for this specific test
    analyzeSpy.mockResolvedValue({
      dish: 'とんかつ定食',
      confidence: 0.9,
      items: [
        { code: 'pork_loin_cutlet', qty_g: 120, include: true },
        { code: 'rice_cooked', qty_g: 200, include: true },
      ],
    });

    const res = await request(app)
      .post('/log')
      .field('user_id', userId)
      .field('text', 'とんかつ定食') // Provide text for analyze to use
      .attach('image', Buffer.from('fake-img'), 'fake.jpg');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.logId).toBeDefined();

    const kcal = res.body?.nutrition?.calories;
    expect(kcal).toBeGreaterThan(0);
    expect(res.body.breakdown.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'とんかつ',
          per100: expect.any(Object),
        }),
        expect.objectContaining({ name: 'ごはん', per100: expect.any(Object) }),
      ]),
    );
  });
});
