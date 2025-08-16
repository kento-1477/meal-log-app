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
    expect(response.body.nutrition.calories).toBe(850);

    const { rows } = await pool.query(
      'SELECT * FROM meal_logs WHERE user_id = $1',
      [userId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].food_item).toBe('カツ丼');
    expect(Number(rows[0].calories)).toBe(850);
    const raw = rows[0].ai_raw;
    expect(
      (typeof raw === 'string' ? JSON.parse(raw) : raw).confidence,
    ).toBeCloseTo(0.75, 2);
  });
});
