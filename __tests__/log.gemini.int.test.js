// __tests__/log.gemini.int.test.js
const request = require('supertest');
const app = require('../server');
const { pool } = require('../services/db');
const { createTestUser } = require('../tests/utils/createTestUser');

describe('/log with Gemini Provider Integration Tests', () => {
  let userId;

  beforeAll(async () => {
    process.env.NUTRITION_PROVIDER = 'gemini';
    process.env.GEMINI_MOCK = '1';
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE users, meal_logs RESTART IDENTITY CASCADE',
    );
    userId = await createTestUser();
  });

  afterAll(async () => {
    await pool.end();
  });

  test('should log a meal and get nutrition from Gemini mock', async () => {
    const response = await request(app)
      .post('/log')
      .send({ message: 'カツ丼', user_id: userId });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    // With the new logic, fallbacks result in pending items, so calories are 0 until confirmed.
    expect(response.body.nutrition.calories).toBe(0);
    expect(response.body.breakdown.items.every((i) => i.pending)).toBe(true);
    expect(response.body.breakdown.items.length).toBe(2); // pork + rice

    const { rows } = await pool.query(
      'SELECT * FROM meal_logs WHERE user_id = $1',
      [userId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].food_item).toBe('カツ丼');
    // The initial logged calories should be 0 as the items are pending
    expect(Number(rows[0].calories)).toBe(0);
    const raw = rows[0].ai_raw;
    // Confidence is 0 for deterministic fallbacks
    expect((typeof raw === 'string' ? JSON.parse(raw) : raw).confidence).toBe(
      0,
    );
  });
});
