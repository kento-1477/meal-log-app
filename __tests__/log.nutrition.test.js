const request = require('supertest');
const app = require('../server');
const { pool } = require('../services/db.js');
const { createTestUser } = require('../tests/utils/createTestUser.js');

// Mock the correct provider now used by the /log route
jest.mock('../services/nutrition/providers/geminiProvider', () => ({
  analyze: jest.fn(async () => ({
    dish: 'モックされた料理',
    confidence: 0.8,
    items: [
      { code: 'rice_cooked', qty_g: 250, include: true },
      { code: 'chicken_breast_cooked', qty_g: 150, include: true },
    ],
  })),
  analyzeText: jest.fn(), // Keep for other tests if they use it
}));

// Import the mocked function to check calls
const { analyze } = require('../services/nutrition/providers/geminiProvider');

describe('/log with nutrition', () => {
  let userId;

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE users, meal_logs RESTART IDENTITY CASCADE',
    );
    userId = await createTestUser();
    // Clear mock calls before each test
    analyze.mockClear();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should insert meal, analyze nutrition, update row and respond with nutrition', async () => {
    const res = await request(app)
      .post('/log')
      .field('user_id', userId)
      .attach('image', Buffer.from('fake'), 'fake.jpg');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.logId).toBeDefined();

    // The response now contains the computed breakdown, so we check the final computed values
    expect(res.body.nutrition.calories).toBeDefined();
    expect(res.body.nutrition.protein_g).toBeDefined();

    // Check that our mock was called correctly
    expect(analyze).toHaveBeenCalledWith({
      text: '',
      imageBuffer: expect.any(Buffer),
      mime: 'image/jpeg',
    });

    const { rows } = await pool.query(
      'SELECT calories, protein_g, fat_g, carbs_g FROM meal_logs WHERE id = $1',
      [res.body.logId],
    );
    const r = rows[0];
    expect(r.calories).toEqual(expect.any(String));
    expect(r.protein_g).toEqual(expect.any(String));
  });

  it('should map english codes to JP reps and sum kcal correctly', async () => {
    // Mock Gemini to return English codes for tonkatsu and rice
    analyze.mockImplementationOnce(async () => ({
      dish: 'とんかつ定食',
      confidence: 0.9,
      items: [
        { code: 'pork_loin_cutlet', qty_g: 120, include: true },
        { code: 'rice_cooked', qty_g: 200, include: true },
      ],
    }));

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
