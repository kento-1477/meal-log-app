const request = require('supertest');
const app = require('../server');
const { pool } = require('../services/db.js');
const { createTestUser } = require('../tests/utils/createTestUser.js');

// Mock the correct provider now used by the /log route
jest.mock('../services/nutrition/providers/geminiProvider', () => ({
  analyzeText: jest.fn(async () => ({
    calories: 450,
    protein_g: 30,
    fat_g: 12,
    carbs_g: 50,
    confidence: 0.9,
    items: [],
  })),
}));

// Import the mocked function to check calls
const {
  analyzeText,
} = require('../services/nutrition/providers/geminiProvider');

describe('/log with nutrition', () => {
  let userId;

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE users, meal_logs RESTART IDENTITY CASCADE',
    );
    userId = await createTestUser();
    // Clear mock calls before each test
    analyzeText.mockClear();
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

    // Check that our mock was called correctly (with a placeholder for image-only logs)
    expect(analyzeText).toHaveBeenCalledWith({ text: '画像記録' });

    const { rows } = await pool.query(
      'SELECT calories, protein_g, fat_g, carbs_g FROM meal_logs WHERE id = $1',
      [res.body.logId],
    );
    const r = rows[0];
    expect(r.calories).toEqual(expect.any(String));
    expect(r.protein_g).toEqual(expect.any(String));
  });
});
